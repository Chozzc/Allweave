"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { PluginModelCatalog } from "../../core";
import { filterModelCatalog } from "../../core";
import { apiUrl, hostFetch } from "../host";

export type PluginsRegistryPayload = {
    version: 1;
    generatedAt: string;
    scannerVersion?: number;
    nodePluginMap: Record<string, string[]>;
    plugins: Record<
        string,
        {
            methodsByNodeSlot?: Record<
                string,
                { methodName: string; models?: string[] }
            >;
            /** Live model catalog declared via `TONGFLOW_MODEL_CATALOG`. */
            modelCatalog?: PluginModelCatalog;
            /** Presentation metadata merged from `tongflow.plugin.json`. */
            name?: string;
            description?: string;
            icon?: string;
        }
    >;
    errors?: Array<{ pluginId: string; message: string }>;
};

type PluginsRegistryState = {
    registry: PluginsRegistryPayload | null;
    isLoaded: boolean;
    isLoading: boolean;
    error: Error | null;
};

let fetchPromise: Promise<void> | null = null;

export const usePluginsRegistryStore = create<PluginsRegistryState>(() => ({
    registry: null,
    isLoaded: false,
    isLoading: false,
    error: null,
}));

async function loadRegistry(): Promise<void> {
    const state = usePluginsRegistryStore.getState();
    if (state.isLoaded || fetchPromise)
        return fetchPromise ?? Promise.resolve();

    usePluginsRegistryStore.setState({ isLoading: true });

    fetchPromise = (async () => {
        try {
            const res = await hostFetch(apiUrl("/api/plugins/registry"), {
                cache: "no-store",
                credentials: "same-origin",
            });
            if (!res.ok) {
                const j = (await res.json()) as { error?: string };
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const payload = (await res.json()) as PluginsRegistryPayload;
            usePluginsRegistryStore.setState({
                registry: payload,
                isLoaded: true,
                isLoading: false,
                error: null,
            });
        } catch (e) {
            usePluginsRegistryStore.setState({
                isLoaded: false,
                isLoading: false,
                error: e instanceof Error ? e : new Error(String(e)),
            });
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

export function usePluginsRegistry() {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const isLoaded = usePluginsRegistryStore((s) => s.isLoaded);
    const isLoading = usePluginsRegistryStore((s) => s.isLoading);
    const error = usePluginsRegistryStore((s) => s.error);

    useEffect(() => {
        void loadRegistry();
    }, []);

    return { registry, isLoaded, isLoading, error };
}

/**
 * Force refresh registry from the server (e.g. after install/update/remove).
 */
export async function refreshPluginsRegistry(): Promise<void> {
    usePluginsRegistryStore.setState({ isLoaded: false });
    await loadRegistry();
}

function dedupeIds(list: string[]): string[] {
    const seen = new Set<string>();
    return list
        .map((s) => s.trim())
        .filter((s) => Boolean(s))
        .filter((s) => {
            if (seen.has(s)) return false;
            seen.add(s);
            return true;
        });
}

/** Plugin directory names registered for a single ABI `nodeSlot`. */
export function useNodePluginIds(nodeSlot: string): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const list = registry?.nodePluginMap?.[nodeSlot] ?? [];
    return dedupeIds(list);
}

// ── Live model catalogs ─────────────────────────────────────────────────────
// A router-style plugin may declare `TONGFLOW_MODEL_CATALOG`: a public,
// CORS-enabled URL the browser fetches directly plus per-slot filter rules.
// Matching ids extend the static shortlist in the model dropdown. Fetched at
// most once per TTL per plugin; failures keep the static list (no UI error).

type LiveModelsEntry = { fetchedAt: number; bySlot: Record<string, string[]> };

type LiveModelsState = { byPlugin: Record<string, LiveModelsEntry> };

export const useLiveModelsStore = create<LiveModelsState>(() => ({
    byPlugin: {},
}));

const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogInflight = new Map<string, Promise<void>>();

/**
 * Fetch (or refresh, once the TTL elapsed) a plugin's live model catalog. Safe
 * to call eagerly — it is a no-op for plugins without a catalog and while a
 * fresh result is cached.
 */
export async function loadPluginModelCatalog(pluginId: string): Promise<void> {
    const catalog =
        usePluginsRegistryStore.getState().registry?.plugins?.[pluginId]
            ?.modelCatalog;
    if (!catalog) return;
    const cached = useLiveModelsStore.getState().byPlugin[pluginId];
    if (cached && Date.now() - cached.fetchedAt < MODEL_CATALOG_TTL_MS) return;
    const inflight = catalogInflight.get(pluginId);
    if (inflight) return inflight;
    const job = (async () => {
        try {
            const res = await fetch(catalog.url, {
                method: "GET",
                cache: "no-store",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bySlot = filterModelCatalog(catalog, await res.json());
            useLiveModelsStore.setState((s) => ({
                byPlugin: {
                    ...s.byPlugin,
                    [pluginId]: { fetchedAt: Date.now(), bySlot },
                },
            }));
        } catch (e) {
            // Keep the static shortlist; retry after the TTL like a miss.
            console.warn(
                `[tongflow] model catalog for ${pluginId} unavailable:`,
                e,
            );
        } finally {
            catalogInflight.delete(pluginId);
        }
    })();
    catalogInflight.set(pluginId, job);
    return job;
}

/**
 * Synchronous read of a plugin's model ids for one slot: the static shortlist
 * (declared order, first = default) followed by any live-catalog extras.
 */
export function getNodePluginModels(
    nodeSlot: string,
    pluginId: string,
): string[] {
    const registry = usePluginsRegistryStore.getState().registry;
    const declared =
        registry?.plugins?.[pluginId]?.methodsByNodeSlot?.[nodeSlot]?.models ??
        [];
    const live =
        useLiveModelsStore.getState().byPlugin[pluginId]?.bySlot[nodeSlot] ??
        [];
    return dedupeIds([...declared, ...live]);
}

/**
 * Model ids a plugin offers for one ABI `nodeSlot` (empty for single-model
 * plugins — the model dropdown is hidden in that case): the static shortlist
 * plus live-catalog extras, which this hook fetches on first use.
 */
export function useNodePluginModels(
    nodeSlot: string,
    pluginId: string,
): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const declared =
        registry?.plugins?.[pluginId]?.methodsByNodeSlot?.[nodeSlot]?.models ??
        [];
    const hasCatalog = Boolean(registry?.plugins?.[pluginId]?.modelCatalog);
    const live = useLiveModelsStore(
        (s) => s.byPlugin[pluginId]?.bySlot[nodeSlot],
    );

    useEffect(() => {
        if (hasCatalog) void loadPluginModelCatalog(pluginId);
    }, [hasCatalog, pluginId]);

    return dedupeIds([...declared, ...(live ?? [])]);
}

export type PluginMeta = {
    name?: string;
    description?: string;
    icon?: string;
};

/** Presentation metadata (name/description/icon) for a single plugin. */
export function usePluginMeta(pluginId: string): PluginMeta {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const p = registry?.plugins?.[pluginId];
    return {
        name: p?.name,
        description: p?.description,
        icon: p?.icon,
    };
}

/**
 * Union of plugin ids for several slots (e.g. `transcribe` + `transcribe_timestamp`).
 */
export function useNodePluginIdsUnion(nodeSlots: string[]): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const out: string[] = [];
    for (const slot of nodeSlots) {
        for (const id of registry?.nodePluginMap?.[slot] ?? []) {
            out.push(id);
        }
    }
    return dedupeIds(out);
}
