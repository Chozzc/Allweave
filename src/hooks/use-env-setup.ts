"use client";

import { useEffect } from "react";
import { logger } from "tongflow";
import { create } from "zustand";
import { apiGet } from "@/lib/api/client";

/**
 * Setup status shared by the onboarding surfaces (welcome wizard, canvas
 * banner) and the Modal connect flow. Backed by the secret-free
 * `/api/settings/env-status` endpoint; `markModalConnected` flips the state
 * optimistically so the banner disappears the moment the user connects.
 */

interface EnvStatusResponse {
    modalConnected: boolean;
    modalRelevant: boolean;
}

type EnvSetupState = {
    /** null = not fetched yet. */
    modalConnected: boolean | null;
    modalRelevant: boolean;
};

export const useEnvSetupStore = create<EnvSetupState>(() => ({
    modalConnected: null,
    modalRelevant: false,
}));

let fetchPromise: Promise<void> | null = null;

export async function refreshEnvSetup(): Promise<void> {
    if (fetchPromise) return fetchPromise;
    fetchPromise = (async () => {
        try {
            const status = await apiGet<EnvStatusResponse>(
                "/api/settings/env-status",
            );
            useEnvSetupStore.setState({
                modalConnected: status.modalConnected,
                modalRelevant: status.modalRelevant,
            });
        } catch (error) {
            logger.error("Failed to load env setup status:", error);
        } finally {
            fetchPromise = null;
        }
    })();
    return fetchPromise;
}

/** Optimistic flip after a successful connect; confirmed by a refresh. */
export function markModalConnected(): void {
    useEnvSetupStore.setState({ modalConnected: true });
    void refreshEnvSetup();
}

/** Optimistic flip after a disconnect. */
export function markModalDisconnected(): void {
    useEnvSetupStore.setState({ modalConnected: false });
    void refreshEnvSetup();
}

export function useEnvSetup() {
    const modalConnected = useEnvSetupStore((s) => s.modalConnected);
    const modalRelevant = useEnvSetupStore((s) => s.modalRelevant);

    useEffect(() => {
        if (useEnvSetupStore.getState().modalConnected === null) {
            void refreshEnvSetup();
        }
    }, []);

    return { modalConnected, modalRelevant };
}
