"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markModalConnected } from "@/hooks/use-env-setup";
import { useInChinaTz } from "@/hooks/use-in-china-tz";
import { apiPatch } from "@/lib/api/client";
import { openExternalUrl } from "@/lib/desktop/open-external";
import { logger } from "@/lib/logger";
import {
    MODAL_TOKEN_ID_ENV,
    MODAL_TOKEN_SECRET_ENV,
} from "@/lib/settings/env-key-metadata";

const MODAL_TOKENS_URL = "https://modal.com/settings/tokens";
const DISCORD_URL = "https://discord.gg/K7V8az94Zf";

/**
 * Community hand-off for users who get stuck on setup: the WeChat group QR
 * for mainland-China users (Discord is unreachable there), Discord otherwise.
 */
function CommunityHelpFooter() {
    const t = useTranslations("ModalConnect");
    const inChina = useInChinaTz();

    return (
        <div className="space-y-2 border-t pt-3">
            {inChina ? (
                <>
                    <p className="text-xs text-muted-foreground">
                        {t("helpWechatPrompt")}
                    </p>
                    <div className="flex justify-center">
                        <img
                            src="/wechat-group-qr.png"
                            alt={t("helpWechatQrAlt")}
                            className="h-32 w-32 rounded-lg bg-white p-1.5"
                        />
                    </div>
                    <div className="flex justify-center">
                        <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                            onClick={() => openExternalUrl(DISCORD_URL)}
                        >
                            {t("helpDiscordLink")}
                            <ExternalLink className="h-3 w-3" />
                        </button>
                    </div>
                </>
            ) : (
                <p className="text-xs text-muted-foreground">
                    {t("helpDiscordPrompt")}{" "}
                    <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        onClick={() => openExternalUrl(DISCORD_URL)}
                    >
                        {t("helpDiscordLink")}
                        <ExternalLink className="h-3 w-3" />
                    </button>
                </p>
            )}
        </div>
    );
}

/**
 * Guided paste flow for connecting the user's Modal account: the "why"
 * story, a jump-off to Modal's token page, and two paste fields. Dialog- and
 * wizard-agnostic — the caller wraps it and reacts to `onConnected`.
 */
export function ModalConnectForm({
    onConnected,
}: {
    onConnected?: () => void;
}) {
    const t = useTranslations("ModalConnect");
    const managed = process.env.NEXT_PUBLIC_MANAGED_PLUGINS === "1";
    const [tokenId, setTokenId] = useState("");
    const [tokenSecret, setTokenSecret] = useState("");
    const [saving, setSaving] = useState(false);

    const id = tokenId.trim();
    const secret = tokenSecret.trim();
    // Soft format check only — Modal's prefixes could change; never block.
    const idLooksOff = id.length > 0 && !id.startsWith("ak-");
    const secretLooksOff = secret.length > 0 && !secret.startsWith("as-");

    const connect = async () => {
        setSaving(true);
        try {
            await apiPatch("/api/settings/env", {
                env: {
                    [MODAL_TOKEN_ID_ENV]: id,
                    [MODAL_TOKEN_SECRET_ENV]: secret,
                },
            });
            markModalConnected();
            toast.success(t("connectedToast"));
            onConnected?.();
        } catch (error) {
            logger.error("Failed to save Modal token:", error);
            toast.error(t("connectFailed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• {t("storyRun")}</li>
                <li>• {t("storyCredits")}</li>
                <li>• {managed ? t("storyManaged") : t("storyLocal")}</li>
            </ul>

            <div className="space-y-2">
                <p className="text-sm font-medium">{t("step1Title")}</p>
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => openExternalUrl(MODAL_TOKENS_URL)}
                >
                    {t("openTokens")}
                    <ExternalLink className="ml-1 h-4 w-4" />
                </Button>
                <p className="text-xs text-muted-foreground">
                    {t("signupHint")}
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium">{t("step2Title")}</p>
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                        {t("tokenIdLabel")}
                    </span>
                    <Input
                        value={tokenId}
                        placeholder="ak-…"
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono text-xs"
                        onChange={(e) => setTokenId(e.target.value)}
                    />
                    {idLooksOff ? (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            {t("prefixWarningId")}
                        </p>
                    ) : null}
                </div>
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                        {t("tokenSecretLabel")}
                    </span>
                    <Input
                        value={tokenSecret}
                        placeholder="as-…"
                        type="password"
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono text-xs"
                        onChange={(e) => setTokenSecret(e.target.value)}
                    />
                    {secretLooksOff ? (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            {t("prefixWarningSecret")}
                        </p>
                    ) : null}
                </div>
            </div>

            <Button
                type="button"
                className="w-full"
                disabled={!id || !secret || saving}
                onClick={connect}
            >
                {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("saveConnect")}
            </Button>

            <CommunityHelpFooter />
        </div>
    );
}
