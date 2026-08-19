"use client";

import { useEffect } from "react";
import { create } from "zustand";
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

/**
 * Model ids a plugin declares for one ABI `nodeSlot` (empty for single-model
 * plugins — the model dropdown is hidden in that case).
 */
export function useNodePluginModels(
    nodeSlot: string,
    pluginId: string,
): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const models =
        registry?.plugins?.[pluginId]?.methodsByNodeSlot?.[nodeSlot]?.models ??
        [];
    return dedupeIds(models);
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
