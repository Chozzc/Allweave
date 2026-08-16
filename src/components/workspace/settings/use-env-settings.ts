"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { logger } from "tongflow";
import { apiGet, apiPut } from "@/lib/api/client";
import type { PluginEnvDecl } from "@/lib/plugins/plugin-env-manifest-schema";

interface EnvResponse {
    env: Record<string, string>;
    pluginEnv?: PluginEnvDecl[];
}

export interface CustomRow {
    key: string;
    value: string;
}

/**
 * Fetch/edit/save state for the settings dialog. One flat values map for
 * declared keys (a key shared by several plugins is edited once and stays in
 * sync everywhere) plus free-form rows for undeclared keys. Internal platform
 * keys never appear here — the API filters them out and preserves them across
 * saves server-side.
 */
export function useEnvSettings() {
    const t = useTranslations("Settings");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [decls, setDecls] = useState<PluginEnvDecl[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [customRows, setCustomRows] = useState<CustomRow[]>([]);
    // Keyed by env key for declared rows, `custom:${index}` for custom rows.
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});

    const applyEnv = useCallback(
        (env: Record<string, string>, nextDecls: PluginEnvDecl[]) => {
            const claimed = new Set(
                nextDecls.flatMap((d) => d.env.map((v) => v.key)),
            );
            const nextValues: Record<string, string> = {};
            const nextCustom: CustomRow[] = [];
            for (const [key, value] of Object.entries(env)) {
                if (claimed.has(key)) nextValues[key] = value;
                else nextCustom.push({ key, value });
            }
            setDecls(nextDecls);
            setValues(nextValues);
            setCustomRows(nextCustom);
            setRevealed({});
        },
        [],
    );

    const fetchEnv = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiGet<EnvResponse>("/api/settings/env");
            applyEnv(data.env ?? {}, data.pluginEnv ?? []);
        } catch (error) {
            logger.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }, [applyEnv]);

    const setValue = useCallback((key: string, value: string) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const toggleReveal = useCallback((key: string) => {
        setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const updateCustomRow = useCallback(
        (index: number, patch: Partial<CustomRow>) => {
            setCustomRows((prev) =>
                prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
            );
        },
        [],
    );

    const addCustomRow = useCallback(
        () => setCustomRows((prev) => [...prev, { key: "", value: "" }]),
        [],
    );

    const removeCustomRow = useCallback((index: number) => {
        setCustomRows((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const save = useCallback(async () => {
        // Collapse everything into one flat map; last non-empty key wins,
        // blank keys dropped. Declared values merge last so cards win over a
        // duplicate custom row; empty declared values are not persisted (a
        // stored "" would shadow a shell-exported key via withStoredEnv).
        const env: Record<string, string> = {};
        for (const { key, value } of customRows) {
            const k = key.trim();
            if (k) env[k] = value;
        }
        for (const [key, value] of Object.entries(values)) {
            if (value.trim()) env[key] = value;
            else delete env[key];
        }
        setSaving(true);
        try {
            const data = await apiPut<EnvResponse>("/api/settings/env", {
                env,
            });
            applyEnv(data.env ?? {}, decls);
            toast.success(t("saved"));
        } catch (error) {
            logger.error("Failed to save settings:", error);
        } finally {
            setSaving(false);
        }
    }, [customRows, values, decls, applyEnv, t]);

    return {
        loading,
        saving,
        decls,
        values,
        customRows,
        revealed,
        fetchEnv,
        setValue,
        toggleReveal,
        updateCustomRow,
        addCustomRow,
        removeCustomRow,
        save,
    };
}
