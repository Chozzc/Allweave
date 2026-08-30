"use client";

import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import { logger } from "tongflow";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    apiPatch,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Textarea,
} from "tongflow/canvas";
import { DISCORD_URL, WECHAT_GROUP_QR_SRC } from "@/constants/community";
import { useInChinaTz } from "@/hooks/use-in-china-tz";
import { patchBrowserEnv } from "@/lib/browser-storage";
import { openExternalUrl } from "@/lib/desktop/open-external";
import { localizeTaskError } from "@/lib/task/error-localize";

/** One credential extracted from the pasted blob. */
export interface TokenSpec {
    envKey: string;
    /** Prefix-anchored pattern that picks the value out of any pasted text.
     * Absent = loose extraction (strip `KEY=`, quotes, surrounding prose). */
    pattern?: RegExp;
    /** Show the matched value masked in the parse status (ids yes, secrets no). */
    masked: boolean;
    /** i18n keys (within the provider namespace) for the parse status line. */
    detectedKey: string;
    missingKey: string;
}

/**
 * Outcome of a post-connect check against the provider. `null` means the
 * question could not be asked (no probe endpoint, provider unreachable) —
 * never a verdict, so nothing is shown.
 */
export interface TokenVerifyResult {
    ok: boolean;
    errorCode?: string;
    errorParams?: Record<string, string | number>;
}

/**
 * A guided token-connect provider. All user-facing copy lives in the `ns`
 * i18n namespace (interpolated with `tValues`), which must carry the shared
 * connect-flow key set (story1/2, storyManaged/storyLocal, step1Title,
 * openTokens, signupHint, step2Title, pasteHint, saveConnect,
 * connectedToast, connectFailed, cardTitle, cardBlurb, connectCta,
 * connectedBadge, reconnect, disconnect, disconnectedToast,
 * disconnectConfirm*, disconnectCancel).
 */
export interface TokenProviderConfig {
    ns: string;
    /** Where to create the credential; step 1 is hidden when absent. */
    tokensUrl?: string;
    pastePlaceholder: string;
    specs: TokenSpec[];
    /** Interpolation values for every message (e.g. { provider: "OpenAI" }). */
    tValues?: Record<string, string>;
    /**
     * Optional post-connect check: a saved credential can still be unusable
     * (Modal accepts the token but won't run GPUs without a payment method).
     * Blocks the connect flow while it runs and, on a coded failure, keeps the
     * dialog open on a fix-it panel rather than reporting success. Providers
     * that set this must also carry `verifying`, `verifyBlockedTitle`,
     * `verifyFixCta` and `verifyRecheck` in their namespace; the failure body
     * comes from `TaskErrors.<code>`.
     */
    verify?: () => Promise<TokenVerifyResult | null>;
    /** Optional store flips (e.g. Modal's onboarding banner). */
    onConnectedStore?: () => void;
    onDisconnectedStore?: () => void;
}

function maskToken(token: string): string {
    if (token.length <= 10) return token;
    return `${token.slice(0, 5)}…${token.slice(-4)}`;
}

/**
 * Best-effort credential extraction when no prefix pattern is known: strips
 * an `KEY=` assignment, surrounding quotes, and — if several tokens remain —
 * keeps the longest one (API keys are long blobs).
 */
function extractLoose(raw: string): string {
    let s = raw.trim();
    const eq = s.lastIndexOf("=");
    if (eq >= 0) s = s.slice(eq + 1);
    s = s
        .trim()
        .replace(/^["']+|["']+$/g, "")
        .trim();
    if (/\s/.test(s)) {
        s = s.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
    }
    return s;
}

/** Whether every credential of a provider is present in the values map. */
export function isTokenConnected(
    config: TokenProviderConfig,
    values: Record<string, string>,
): boolean {
    return config.specs.every((spec) => (values[spec.envKey] ?? "").trim());
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
 * Copy lives in the ModalConnect namespace (provider-agnostic help keys).
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
                            src={WECHAT_GROUP_QR_SRC}
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
 * Guided paste flow: the "why" story, a jump-off to the provider's token
 * page, and one paste-anything box that extracts the credential(s) from the
 * copied text. Dialog- and wizard-agnostic — the caller wraps it and reacts
 * to `onConnected`.
 */
export function TokenConnectForm({
    config,
    onConnected,
    onSaved,
}: {
    config: TokenProviderConfig;
    /** Connected *and* verified — the caller closes the dialog / advances. */
    onConnected?: () => void;
    /** Credential persisted, verification still pending or failed. Lets the
     * caller refresh its env map without dismissing the fix-it panel. */
    onSaved?: () => void;
}) {
    const rawT = useTranslations(config.ns);
    const t = (key: string, values?: Record<string, string>) =>
        rawT(key, { ...config.tValues, ...values });
    const tErr = useTranslations("TaskErrors");
    const managed = process.env.NEXT_PUBLIC_MANAGED_PLUGINS === "1";
    const [raw, setRaw] = useState("");
    const [phase, setPhase] = useState<"idle" | "saving" | "verifying">("idle");
    const [blocked, setBlocked] = useState<TokenVerifyResult | null>(null);
    const busy = phase !== "idle";

    // Token pages usually show one copyable command/value, so accept any
    // pasted blob and extract the value(s) — no field splitting required.
    const parsed = config.specs.map((spec) =>
        spec.pattern ? (raw.match(spec.pattern)?.[0] ?? "") : extractLoose(raw),
    );
    const allFound = parsed.every(Boolean);

    /** Runs the provider check; true when the flow may report success. */
    const runVerify = async (): Promise<boolean> => {
        if (!config.verify) return true;
        setPhase("verifying");
        const result = await config.verify();
        if (result && !result.ok && result.errorCode) {
            setBlocked(result);
            return false;
        }
        setBlocked(null);
        return true;
    };

    const succeed = () => {
        toast.success(t("connectedToast"));
        onConnected?.();
    };

    const connect = async () => {
        setBlocked(null);
        setPhase("saving");
        try {
            const env: Record<string, string> = {};
            config.specs.forEach((spec, i) => {
                env[spec.envKey] = parsed[i];
            });
            await apiPatch("/api/settings/env", { env });
            await patchBrowserEnv(env);
            config.onConnectedStore?.();
            // The credential is stored whatever the check says next, so let
            // the caller refresh now; only success dismisses the dialog.
            onSaved?.();
            if (await runVerify()) succeed();
        } catch (error) {
            logger.error(`Failed to save token (${config.ns}):`, error);
            toast.error(t("connectFailed"));
        } finally {
            setPhase("idle");
        }
    };

    // Re-ask without re-saving: the fix happens in the provider's console, so
    // the user comes back to this panel with the same credential in place.
    const recheck = async () => {
        try {
            if (await runVerify()) succeed();
        } catch (error) {
            logger.error(`Verify failed (${config.ns}):`, error);
        } finally {
            setPhase("idle");
        }
    };

    return (
        <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• {t("story1")}</li>
                <li>• {t("story2")}</li>
                <li>• {managed ? t("storyManaged") : t("storyLocal")}</li>
            </ul>

            {config.tokensUrl ? (
                <div className="space-y-2">
                    <p className="text-sm font-medium">{t("step1Title")}</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                            config.tokensUrl &&
                            openExternalUrl(config.tokensUrl)
                        }
                    >
                        {t("openTokens")}
                        <ExternalLink className="ml-1 h-4 w-4" />
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        {t("signupHint")}
                    </p>
                </div>
            ) : null}

            <div className="space-y-2">
                <p className="text-sm font-medium">{t("step2Title")}</p>
                <Textarea
                    value={raw}
                    placeholder={config.pastePlaceholder}
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
                    {config.specs.map((spec, i) => (
                        <TokenParseStatus
                            key={spec.envKey}
                            found={Boolean(parsed[i])}
                            foundLabel={
                                spec.masked
                                    ? t(spec.detectedKey, {
                                          id: maskToken(parsed[i]),
                                      })
                                    : t(spec.detectedKey)
                            }
                            missingLabel={t(spec.missingKey)}
                        />
                    ))}
                </div>
            </div>

            {phase === "verifying" ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                    {t("verifying")}
                </p>
            ) : null}

            {blocked ? (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium">
                        {t("verifyBlockedTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {localizeTaskError(tErr, blocked)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {typeof blocked.errorParams?.url === "string" ? (
                            <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                    openExternalUrl(
                                        String(blocked.errorParams?.url),
                                    )
                                }
                            >
                                {t("verifyFixCta")}
                                <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={recheck}
                        >
                            {busy ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {t("verifyRecheck")}
                        </Button>
                    </div>
                </div>
            ) : null}

            <Button
                type="button"
                className="w-full"
                disabled={!allFound || busy}
                onClick={connect}
            >
                {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("saveConnect")}
            </Button>

            <CommunityHelpFooter />
        </div>
    );
}

/** Thin dialog wrapper around the connect form (settings card, banner). */
export function TokenConnectDialog({
    config,
    open,
    onOpenChange,
    onConnected,
}: {
    config: TokenProviderConfig;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected?: () => void;
}) {
    const t = useTranslations(config.ns);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title", config.tValues)}</DialogTitle>
                    <DialogDescription>
                        {t("subtitle", config.tValues)}
                    </DialogDescription>
                </DialogHeader>
                <TokenConnectForm
                    config={config}
                    onSaved={onConnected}
                    onConnected={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    );
}

/** Green "connected" badge shared by the standalone card and provider cards. */
export function TokenConnectedBadge({
    config,
}: {
    config: TokenProviderConfig;
}) {
    const t = useTranslations(config.ns);
    return (
        <Badge
            variant="secondary"
            className="gap-1 text-green-600 dark:text-green-500"
        >
            <CheckCircle2 className="h-3 w-3" />
            {t("connectedBadge", config.tValues)}
        </Badge>
    );
}

/**
 * Connect-state block without the card chrome, so callers can embed it in
 * their own card (e.g. a provider card that also hosts advanced knobs).
 * Disconnected: the one-line story plus a prominent connect button.
 * Connected: masked credential with reconnect / disconnect. Disconnecting
 * clears only the provider's own keys — any platform bookkeeping is internal
 * and intentionally retained.
 */
export function TokenConnectCardBody({
    config,
    values,
    onChanged,
}: {
    config: TokenProviderConfig;
    /** The settings dialog's flat env values map. */
    values: Record<string, string>;
    /** Called after connect/disconnect so the dialog refetches its env map. */
    onChanged: () => void;
}) {
    const rawT = useTranslations(config.ns);
    const t = (key: string) => rawT(key, config.tValues);
    const [connectOpen, setConnectOpen] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const connected = isTokenConnected(config, values);
    const displaySpec =
        config.specs.find((spec) => spec.masked) ?? config.specs[0];
    const displayValue = (values[displaySpec.envKey] ?? "").trim();

    const disconnect = async () => {
        setDisconnecting(true);
        try {
            const env: Record<string, string> = {};
            for (const spec of config.specs) env[spec.envKey] = "";
            await apiPatch("/api/settings/env", { env });
            await patchBrowserEnv(env);
            config.onDisconnectedStore?.();
            toast.success(t("disconnectedToast"));
            onChanged();
        } catch (error) {
            logger.error(`Failed to disconnect (${config.ns}):`, error);
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <>
            {connected ? (
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                        {displaySpec.masked
                            ? maskToken(displayValue)
                            : "••••••"}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setConnectOpen(true)}
                        >
                            {t("reconnect")}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-red-600"
                                    disabled={disconnecting}
                                >
                                    {disconnecting ? (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {t("disconnect")}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        {t("disconnectConfirmTitle")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {t("disconnectConfirmBody")}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        {t("disconnectCancel")}
                                    </AlertDialogCancel>
                                    <AlertDialogAction onClick={disconnect}>
                                        {t("disconnect")}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {t("cardBlurb")}
                    </p>
                    <Button
                        type="button"
                        className="w-full"
                        onClick={() => setConnectOpen(true)}
                    >
                        {t("connectCta")}
                    </Button>
                </div>
            )}

            <TokenConnectDialog
                config={config}
                open={connectOpen}
                onOpenChange={setConnectOpen}
                onConnected={onChanged}
            />
        </>
    );
}

/** Standalone settings card: title + connected badge + connect body. */
export function TokenConnectCard({
    config,
    values,
    onChanged,
}: {
    config: TokenProviderConfig;
    values: Record<string, string>;
    onChanged: () => void;
}) {
    const t = useTranslations(config.ns);
    return (
        <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                    {t("cardTitle", config.tValues)}
                </span>
                {isTokenConnected(config, values) ? (
                    <TokenConnectedBadge config={config} />
                ) : null}
            </div>
            <TokenConnectCardBody
                config={config}
                values={values}
                onChanged={onChanged}
            />
        </div>
    );
}
