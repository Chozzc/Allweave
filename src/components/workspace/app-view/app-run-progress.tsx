"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { useTaskStore } from "@/hooks/use-task";

/**
 * Step progress for an app-mode run: progress bar + "step n/m · node label".
 * Reads the store maps that use-workflow-execution keeps updated from SSE,
 * so it stays correct across mode switches mid-run.
 */
export function AppRunProgress({
    totalSteps,
    stepLabels,
}: {
    totalSteps: number;
    stepLabels: Map<string, string>;
}) {
    const t = useTranslations("Workspace.appView");
    const workflowExecutionStatus = useTaskStore(
        (state) => state.workflowExecutionStatus,
    );
    const nodeExecutionStatusMap = useTaskStore(
        (state) => state.nodeExecutionStatusMap,
    );

    if (workflowExecutionStatus === "idle") return null;

    if (workflowExecutionStatus === "completed") {
        return (
            <div className="text-sm text-emerald-500 text-center">
                {t("completed")}
            </div>
        );
    }

    if (workflowExecutionStatus === "failed") {
        return (
            <div className="text-sm text-red-500 text-center">
                {t("failed")}
            </div>
        );
    }

    // running / paused
    let completed = 0;
    let runningLabel: string | null = null;
    for (const [nodeId, label] of stepLabels) {
        const status = nodeExecutionStatusMap.get(nodeId);
        if (status === "completed") completed++;
        else if (status === "running" && runningLabel === null) {
            runningLabel = label;
        }
    }
    const current = Math.min(completed + 1, totalSteps);
    const percent = totalSteps > 0 ? (completed / totalSteps) * 100 : 0;

    return (
        <div className="space-y-1.5">
            <Progress value={percent} />
            <div className="text-xs text-muted-foreground text-center">
                {t("stepProgress", { current, total: totalSteps })}
                {runningLabel ? ` · ${runningLabel}` : ""}
            </div>
        </div>
    );
}
