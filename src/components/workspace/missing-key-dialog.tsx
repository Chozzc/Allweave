"use client";

import { CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch } from "@/lib/api/client";
import { openExternalUrl } from "@/lib/desktop/open-external";
import { logger } from "@/lib/logger";
import type { PluginEnvDecl } from "@/lib/plugins/plugin-env-manifest-schema";

/** What a `missing_api_key` task failure carries (see errorParams). */
export interface MissingKeyRequest {
    key: string;
    url?: string;
}

/**
 * Guided fix for a `missing_api_key` task failure: link out to the provider
 * console, paste the key, save straight into settings — no digging through
 * the settings dialog.
 */
export function MissingKeyDialog({
    request,
    onClose,
}: {
    request: MissingKeyRequest | null;
    onClose: () => void;
}) {
    const t = useTranslations("MissingKeyDialog");
    const [decls, setDecls] = useState<PluginEnvDecl[]>([]);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!request) return;
        setValue("");
        setSaved(false);
        apiGet<{ pluginEnv?: PluginEnvDecl[] }>("/api/settings/env")
            .then((data) => setDecls(data.pluginEnv ?? []))
            .catch((error) =>
                logger.error("Failed to load plugin env decls:", error),
            );
    }, [request]);

    // Provider display info for the key, from the plugin env declarations.
    const info = useMemo(() => {
        if (!request) return null;
        for (const d of decls) {
            const v = d.env.find((e) => e.key === request.key);
            if (v) {
                return {
                    provider: d.meta?.name,
                    url: request.url || v.url,
                };
            }
        }
        return { provider: undefined, url: request.url };
    }, [decls, request]);

    const save = async () => {
        if (!request || !value.trim()) return;
        setSaving(true);
        try {
            await apiPatch("/api/settings/env", {
                env: { [request.key]: value.trim() },
            });
            setSaved(true);
        } catch (error) {
            logger.error("Failed to save API key:", error);
        } finally {
            setSaving(false);
        }
    };

    if (!request) return null;

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-amber-500" />
                        {info?.provider
                            ? `${info.provider} · ${t("title")}`
                            : t("title")}
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-left">
                        {t("body", { key: request.key })}
                    </DialogDescription>
                </DialogHeader>

                {saved ? (
                    <>
                        <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            {t("saved")}
                        </div>
                        <div className="flex justify-end">
                            <Button type="button" onClick={onClose}>
                                {t("done")}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        {info?.url ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="justify-start"
                                onClick={() =>
                                    openExternalUrl(info.url as string)
                                }
                            >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {t("getKey")}
                                <span className="ml-1 truncate text-muted-foreground">
                                    {new URL(info.url).hostname}
                                </span>
                            </Button>
                        ) : null}
                        <Input
                            type="password"
                            autoFocus
                            value={value}
                            placeholder={t("placeholder")}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void save();
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={onClose}
                            >
                                {t("later")}
                            </Button>
                            <Button
                                type="button"
                                disabled={!value.trim() || saving}
                                onClick={() => void save()}
                            >
                                {saving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {t("save")}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
