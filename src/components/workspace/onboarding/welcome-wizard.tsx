"use client";

import { ExternalLink, Loader2, Sparkles } from "lucide-react";
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
import { resolveEnvKeyType } from "@/lib/settings/env-key-metadata";
import { buildSettingsSections } from "../settings/build-settings-sections";
import { MODAL_CONNECT } from "../settings/connect-configs";
import { TokenConnectForm } from "../settings/token-connect";

/** How many provider keys the optional step offers (the rest live in Settings). */
const WIZARD_PROVIDER_LIMIT = 5;

/**
 * One-shot first-run wizard: the "why Modal" story, the guided connect flow,
 * then an optional handful of provider API keys. Skippable at every step;
 * any close path counts as dismissal (the caller persists it).
 */
export function WelcomeWizard({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const t = useTranslations("Onboarding");
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [decls, setDecls] = useState<PluginEnvDecl[]>([]);
    const [keyValues, setKeyValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setKeyValues({});
        apiGet<{ pluginEnv?: PluginEnvDecl[] }>("/api/settings/env")
            .then((data) => setDecls(data.pluginEnv ?? []))
            .catch((error) =>
                logger.error("Failed to load plugin env decls:", error),
            );
    }, [open]);

    // The most common provider secrets: one row per plugin with a single
    // required secret, capped — everything else stays in Settings.
    const providerVars = useMemo(
        () =>
            buildSettingsSections(decls)
                .providers.filter(
                    (p) =>
                        p.requiredVars.length === 1 &&
                        resolveEnvKeyType(
                            p.requiredVars[0].key,
                            p.requiredVars[0],
                        ) === "secret",
                )
                .slice(0, WIZARD_PROVIDER_LIMIT)
                .map((p) => ({ title: p.title, v: p.requiredVars[0] })),
        [decls],
    );

    const finish = async () => {
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(keyValues)) {
            if (value.trim()) env[key] = value.trim();
        }
        if (Object.keys(env).length > 0) {
            setSaving(true);
            try {
                await apiPatch("/api/settings/env", { env });
            } catch (error) {
                logger.error("Failed to save API keys:", error);
            } finally {
                setSaving(false);
            }
        }
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-md">
                {step === 1 ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-amber-500" />
                                {t("welcomeTitle")}
                            </DialogTitle>
                            <DialogDescription className="pt-2 text-left">
                                {t("welcomeBody")}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center justify-between pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={onClose}
                            >
                                {t("skip")}
                            </Button>
                            <Button type="button" onClick={() => setStep(2)}>
                                {t("getStarted")}
                            </Button>
                        </div>
                    </>
                ) : null}

                {step === 2 ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t("connectTitle")}</DialogTitle>
                        </DialogHeader>
                        <TokenConnectForm
                            config={MODAL_CONNECT}
                            onConnected={() => setStep(3)}
                        />
                        <div className="flex justify-start">
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={onClose}
                            >
                                {t("skip")}
                            </Button>
                        </div>
                    </>
                ) : null}

                {step === 3 ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t("apiKeysTitle")}</DialogTitle>
                            <DialogDescription>
                                {t("apiKeysHint")}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                            {providerVars.map(({ title, v }) => (
                                <div key={v.key} className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium">
                                            {title}
                                        </span>
                                        {v.url ? (
                                            // Button, not anchor: the desktop
                                            // shell intercepts anchors (see
                                            // lib/desktop).
                                            <button
                                                type="button"
                                                title={v.url}
                                                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                                                onClick={() =>
                                                    v.url &&
                                                    openExternalUrl(v.url)
                                                }
                                            >
                                                {t("getApiKey")}
                                                <ExternalLink className="h-3 w-3" />
                                            </button>
                                        ) : null}
                                    </div>
                                    <Input
                                        value={keyValues[v.key] ?? ""}
                                        type="password"
                                        spellCheck={false}
                                        autoComplete="off"
                                        className="font-mono text-xs"
                                        onChange={(e) =>
                                            setKeyValues((prev) => ({
                                                ...prev,
                                                [v.key]: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={onClose}
                            >
                                {t("skip")}
                            </Button>
                            <Button
                                type="button"
                                disabled={saving}
                                onClick={finish}
                            >
                                {saving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {t("done")}
                            </Button>
                        </div>
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
