"use client";

import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

// Modal token prefixes; a minimum tail length avoids matching a bare "ak-"
// the user is still typing.
const TOKEN_ID_RE = /ak-[A-Za-z0-9_-]{4,}/;
const TOKEN_SECRET_RE = /as-[A-Za-z0-9_-]{4,}/;

function maskToken(token: string): string {
    if (token.length <= 10) return token;
    return `${token.slice(0, 5)}…${token.slice(-4)}`;
}

function TokenParseStatus({
    found,
    foundLabel,
    missingLabel,
}: {
    found: boolean;
    foundLabel: string;
    missingLabel: string;
}) {
    return (
        <p
            className={`flex items-center gap-1.5 text-xs ${
                found
                    ? "text-green-600 dark:text-green-500"
                    : "text-muted-foreground"
            }`}
        >
            {found ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
                <Circle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="font-mono">
                {found ? foundLabel : missingLabel}
            </span>
        </p>
    );
}

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
 * story, a jump-off to Modal's token page, and one paste-anything box that
 * extracts the token id/secret from the copied command. Dialog- and
 * wizard-agnostic — the caller wraps it and reacts to `onConnected`.
 */
export function ModalConnectForm({
    onConnected,
}: {
    onConnected?: () => void;
}) {
    const t = useTranslations("ModalConnect");
    const managed = process.env.NEXT_PUBLIC_MANAGED_PLUGINS === "1";
    const [raw, setRaw] = useState("");
    const [saving, setSaving] = useState(false);

    // Modal's token page shows one `modal token set --token-id ak-…
    // --token-secret as-…` command with a single copy button, so accept any
    // pasted blob and extract the two values — no field splitting required.
    const id = raw.match(TOKEN_ID_RE)?.[0] ?? "";
    const secret = raw.match(TOKEN_SECRET_RE)?.[0] ?? "";

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
                <Textarea
                    value={raw}
                    placeholder="modal token set --token-id ak-… --token-secret as-…"
                    rows={2}
                    spellCheck={false}
                    autoComplete="off"
                    className="resize-none font-mono text-xs"
                    onChange={(e) => setRaw(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    {t("pasteHint")}
                </p>
                <div className="space-y-1">
                    <TokenParseStatus
                        found={Boolean(id)}
                        foundLabel={t("detectedId", { id: maskToken(id) })}
                        missingLabel={t("missingId")}
                    />
                    <TokenParseStatus
                        found={Boolean(secret)}
                        foundLabel={t("detectedSecret")}
                        missingLabel={t("missingSecret")}
                    />
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
