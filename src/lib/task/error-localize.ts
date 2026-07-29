import type { SerializedTaskError } from "./error-envelope";

/**
 * Client-side localization of coded task errors. Servers emit a stable
 * `errorCode` (+ `errorParams`) alongside the English `message` fallback;
 * the client renders `TaskErrors.<code>` when it knows the code and falls
 * back to the raw message otherwise (e.g. uncoded plugin errors).
 */

const KNOWN_TASK_ERROR_CODES = new Set([
    "subscription_required",
    "modal_not_connected",
    "executor_rejected",
    "executor_provision_failed",
    "task_not_found",
    "workflow_invalid",
    "task_failed_to_start",
]);

/** Minimal translator shape satisfied by both useTranslations and getClientTranslator. */
export type TaskErrorTranslator = (
    key: string,
    values?: Record<string, string | number>,
) => string;

export interface CodedTaskError {
    message?: string | null;
    errorCode?: string;
    errorParams?: Record<string, string | number>;
}

/** Localized headline; falls back to the raw server message. */
export function localizeTaskError(
    t: TaskErrorTranslator,
    e: CodedTaskError,
): string {
    if (e.errorCode && KNOWN_TASK_ERROR_CODES.has(e.errorCode)) {
        return t(e.errorCode, e.errorParams);
    }
    return e.message?.trim() ?? "";
}

/**
 * Whether the failure points at our side rather than the user's config —
 * those errors get community-support links so the user can reach us.
 */
export function shouldOfferSupport(e: CodedTaskError): boolean {
    if (e.errorCode === "executor_rejected") {
        return Number(e.errorParams?.status ?? 0) >= 500;
    }
    return (
        e.errorCode === "task_failed_to_start" ||
        e.errorCode === "executor_provision_failed"
    );
}

/** Localized headline from persisted `tasks.error` JSON; raw string fallback. */
export function localizeStoredTaskError(
    t: TaskErrorTranslator,
    raw: string | null | undefined,
): string {
    if (!raw) return "";
    try {
        const o = JSON.parse(raw) as Partial<SerializedTaskError>;
        const localized = localizeTaskError(t, o);
        if (localized) return localized;
    } catch {
        /* Malformed write — best-effort display below. */
    }
    return raw;
}
