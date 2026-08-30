"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { TaskStatus, WorkflowStatus } from "tongflow";
import type { SSEMessage } from "tongflow/canvas";
import {
    getClientTranslator,
    SSE_TASK_MESSAGE_EVENT,
    showErrorToast,
} from "tongflow/canvas";
import { CommunitySupportRow } from "@/components/workspace/community-support-row";
import {
    MissingKeyDialog,
    type MissingKeyRequest,
} from "@/components/workspace/missing-key-dialog";
import { ModalBillingRow } from "@/components/workspace/modal-billing-row";
import type { SerializedWorkflowFailure } from "@/lib/task/error-envelope";
import { buildTaskErrorDetail } from "@/lib/task/error-format";
import {
    localizeTaskError,
    shouldOfferSupport,
} from "@/lib/task/error-localize";

/**
 * Global listener that surfaces every task / workflow failure as a persistent
 * error toast. All SSE sources (single-task, workflow, recovery) dispatch the
 * same `SSE_TASK_MESSAGE_EVENT`, so one listener covers them all. Deduped by
 * task id so a workflow with several failing nodes still toasts only once;
 * the record is cleared on the next start so a re-run can toast again.
 */
export function TaskFailureToaster() {
    const toastedRef = useRef<Set<string>>(new Set());
    const [missingKey, setMissingKey] = useState<MissingKeyRequest | null>(
        null,
    );
    // TaskErrors lives in the host app's catalog, which getClientTranslator
    // (canvas messages only) cannot see — coded failures rendered as the raw
    // key until this went through the provider instead.
    const tErr = useTranslations("TaskErrors");

    useEffect(() => {
        const t = getClientTranslator("Workspace.toast");

        const handle = (event: CustomEvent<SSEMessage>) => {
            const message = event.detail;
            const taskId = message.id;

            if (
                message.status === WorkflowStatus.WORKFLOW_STARTED ||
                message.status === TaskStatus.PENDING ||
                message.status === TaskStatus.RUNNING
            ) {
                toastedRef.current.delete(taskId);
                return;
            }

            if (
                message.status !== WorkflowStatus.WORKFLOW_FAILED &&
                message.status !== TaskStatus.FAILED
            ) {
                return;
            }

            if (toastedRef.current.has(taskId)) return;
            toastedRef.current.add(taskId);

            const data = message.data;
            const rawText = data?.message?.trim() || data?.error?.trim();
            const coded = {
                message: rawText,
                errorCode: data?.errorCode,
                errorParams: data?.errorParams,
            };

            // A missing provider key gets a guided fix dialog (link to the
            // provider console + paste-and-save) instead of a dead-end toast.
            const params = data?.errorParams as
                | Record<string, unknown>
                | undefined;
            if (
                data?.errorCode === "missing_api_key" &&
                typeof params?.key === "string"
            ) {
                setMissingKey({
                    key: params.key,
                    pluginId:
                        typeof params.pluginId === "string"
                            ? params.pluginId
                            : undefined,
                    url:
                        typeof params.url === "string" ? params.url : undefined,
                });
                return;
            }
            const errorText = localizeTaskError(tErr, coded) || rawText;
            const detail = buildTaskErrorDetail({
                message: errorText,
                errors: data?.errors as string[] | undefined,
                failures: data?.failures as
                    | SerializedWorkflowFailure[]
                    | undefined,
            });

            // With an error message: "Task failed" headline + the message.
            // Without one: just the "Task failed" message, no redundant title.
            showErrorToast({
                title: errorText ? t("taskFailed") : undefined,
                message: errorText || t("taskFailed"),
                detail,
                id: `task-failed:${taskId}`,
                // Fixable in Modal's console, not here — link straight to it.
                // Otherwise server-side faults get community links so users
                // can reach us.
                footer:
                    data?.errorCode === "modal_payment_required" ? (
                        <ModalBillingRow
                            url={
                                typeof params?.url === "string"
                                    ? params.url
                                    : undefined
                            }
                        />
                    ) : shouldOfferSupport(coded) ? (
                        <CommunitySupportRow />
                    ) : undefined,
            });
        };

        window.addEventListener(
            SSE_TASK_MESSAGE_EVENT,
            handle as EventListener,
        );
        return () => {
            window.removeEventListener(
                SSE_TASK_MESSAGE_EVENT,
                handle as EventListener,
            );
        };
    }, [tErr]);

    return (
        <MissingKeyDialog
            request={missingKey}
            onClose={() => setMissingKey(null)}
        />
    );
}
