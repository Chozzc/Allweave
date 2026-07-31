"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaveExecuteDialog } from "@/components/workspace/save-execute-dialog";
import type { FlowState } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { useTaskStore } from "@/hooks/use-task";
import { useWorkflowExecution } from "@/hooks/use-workflow-execution";
import { AppInputField } from "./app-input-field";
import { AppOutputs } from "./app-outputs";
import { AppRunProgress } from "./app-run-progress";
import {
    type AppFieldValue,
    type AppFormField,
    fieldHasValue,
    findAddNodeValueTarget,
    useAppFormModel,
} from "./use-app-form-model";

const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
});

/**
 * App mode: the workflow rendered as a simple form — inputs on top, run
 * button with step progress, final outputs below. The canvas stays mounted
 * (hidden) underneath, so ABI registrations, SSE output application and
 * recovery keep working unchanged.
 */
export function AppView() {
    const {
        nodes,
        edges,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.appView");
    const tIsland = useTranslations("Workspace.smartIsland");
    const tIndex = useTranslations("Index");

    const setWorkspaceMode = useTaskStore((state) => state.setWorkspaceMode);
    const workflowExecutionStatus = useTaskStore(
        (state) => state.workflowExecutionStatus,
    );
    const isRunning = workflowExecutionStatus === "running";

    const model = useAppFormModel(nodes, edges);

    const {
        showSaveDialog,
        setShowSaveDialog,
        tempName,
        setTempName,
        tempDescription,
        setTempDescription,
        isSaving,
        handleExecuteClick,
        handleSaveAndExecute,
        handleStop,
    } = useWorkflowExecution({
        nodes,
        edges,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        defaultWorkflowName: tIndex("title"),
        t: tIsland,
    });

    // Mirrors the canvas Add-node behavior: values land on the downstream
    // data node (spawning one via `expands` when absent), never on the Add
    // node itself; plain data-node fields are written in place.
    const handleFieldChange = useCallback(
        (field: AppFormField, patch: AppFieldValue) => {
            const store = useFlow.getState();
            if (!field.isAddNode) {
                const node = store.nodes.find((n) => n.id === field.nodeId);
                store.updates(field.nodeId, {
                    ...(node?.data as Record<string, unknown>),
                    ...patch,
                });
                return;
            }
            const downstreamId = findAddNodeValueTarget(
                field.nodeId,
                field.expandType,
                store.nodes,
                store.edges,
            );
            if (downstreamId) {
                const downstream = store.nodes.find(
                    (n) => n.id === downstreamId,
                );
                store.updates(downstreamId, {
                    ...(downstream?.data as Record<string, unknown>),
                    ...patch,
                });
            } else {
                store.expands(field.nodeId, [
                    { type: field.expandType, data: { ...patch } },
                ]);
            }
            // Keep addTextNode's own manual value in sync (the exporter's
            // manual-mode path and the canvas textarea both read it).
            if (patch.texts && field.expandType === "textNode") {
                const current = useFlow.getState();
                const addNode = current.nodes.find(
                    (n) => n.id === field.nodeId,
                );
                current.updates(field.nodeId, {
                    ...(addNode?.data as Record<string, unknown>),
                    manualValue: patch.texts[0] ?? "",
                });
            }
        },
        [],
    );

    const missingRequired = model.fields.some(
        (f) => f.required && !fieldHasValue(f),
    );

    if (model.error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
                <p className="text-sm text-muted-foreground text-center">
                    {t(
                        model.error === "empty"
                            ? "emptyWorkflow"
                            : model.error === "invalid"
                              ? "invalidWorkflow"
                              : "nothingToRun",
                    )}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWorkspaceMode("create")}
                >
                    {t("goToCreateMode")}
                </Button>
            </div>
        );
    }

    return (
        <>
            <SaveExecuteDialog
                open={showSaveDialog}
                onOpenChange={setShowSaveDialog}
                isNewWorkflow={!workflowId}
                tempName={tempName}
                tempDescription={tempDescription}
                onNameChange={setTempName}
                onDescriptionChange={setTempDescription}
                onConfirm={handleSaveAndExecute}
                isSaving={isSaving}
            />
            <div className="max-w-2xl mx-auto px-4 pt-20 pb-24 space-y-5">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold">{workflowName}</h1>
                    {workflowDescription && (
                        <p className="text-sm text-muted-foreground">
                            {workflowDescription}
                        </p>
                    )}
                </div>

                {model.fields.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                                {t("inputsTitle")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {model.fields.map((field) => (
                                <AppInputField
                                    key={field.nodeId}
                                    field={field}
                                    onChange={(patch) =>
                                        handleFieldChange(field, patch)
                                    }
                                    disabled={isRunning}
                                />
                            ))}
                        </CardContent>
                    </Card>
                )}

                <div className="space-y-3">
                    {isRunning ? (
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => void handleStop()}
                        >
                            <Square className="size-4" />
                            {t("cancel")}
                        </Button>
                    ) : (
                        <Button
                            className="w-full"
                            disabled={missingRequired || isSaving}
                            onClick={handleExecuteClick}
                        >
                            {isSaving ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Play className="size-4" />
                            )}
                            {t("run")}
                        </Button>
                    )}
                    <AppRunProgress
                        totalSteps={model.totalSteps}
                        stepLabels={model.stepLabels}
                    />
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                            {t("outputsTitle")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <AppOutputs outputs={model.outputs} />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
