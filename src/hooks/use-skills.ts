"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type {
    SkillDefinition,
    SkillRef,
    SkillsRegistry,
} from "@/lib/skills/types";

type SkillsRegistryState = {
    registry: SkillsRegistry | null;
    isLoaded: boolean;
    isLoading: boolean;
    error: Error | null;
};

let fetchPromise: Promise<void> | null = null;

export const useSkillsRegistryStore = create<SkillsRegistryState>(() => ({
    registry: null,
    isLoaded: false,
    isLoading: false,
    error: null,
}));

async function loadRegistry(): Promise<void> {
    const state = useSkillsRegistryStore.getState();
    if (state.isLoaded || fetchPromise)
        return fetchPromise ?? Promise.resolve();

    useSkillsRegistryStore.setState({ isLoading: true });

    fetchPromise = (async () => {
        try {
            const res = await fetch("/api/skills/registry", {
                cache: "no-store",
                credentials: "same-origin",
            });
            if (!res.ok) {
                const j = (await res.json()) as { error?: string };
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const payload = (await res.json()) as SkillsRegistry;
            useSkillsRegistryStore.setState({
                registry: payload,
                isLoaded: true,
                isLoading: false,
                error: null,
            });
        } catch (e) {
            useSkillsRegistryStore.setState({
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

export function useSkillsRegistry() {
    const registry = useSkillsRegistryStore((s) => s.registry);
    const isLoaded = useSkillsRegistryStore((s) => s.isLoaded);
    const isLoading = useSkillsRegistryStore((s) => s.isLoading);
    const error = useSkillsRegistryStore((s) => s.error);

    useEffect(() => {
        void loadRegistry();
    }, []);

    return { registry, isLoaded, isLoading, error };
}

/**
 * Force refresh from the server (e.g. after a package install/uninstall).
 */
export async function refreshSkillsRegistry(): Promise<void> {
    useSkillsRegistryStore.setState({ isLoaded: false });
    await loadRegistry();
}

/**
 * Resolve a node's skill reference against a registry snapshot. Returns null
 * when the package was uninstalled or the skill no longer exists in it.
 */
export function resolveSkill(
    registry: SkillsRegistry | null,
    ref: SkillRef | undefined,
): SkillDefinition | null {
    if (!registry || !ref) return null;
    const pkg = registry.packages[ref.package];
    return pkg?.skills.find((s) => s.id === ref.id) ?? null;
}
