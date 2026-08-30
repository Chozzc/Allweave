"use client";

/**
 * Workspace — the application shell around the canvas.
 *
 * Owns everything that is not the canvas itself: local persistence and
 * restore, the bundled example on first launch, workflow recovery, feature
 * preload, the app-mode overlay, navigation / title / undo / tidy / mode
 * controls and onboarding. The canvas proper is `FlowCanvas`.
 */

import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { logger, parseWorkflowImportJson } from "tongflow";
import {
    apiGet,
    apiPut,
    FlowCanvas,
    useFlow,
    useTaskStore,
} from "tongflow/canvas";
import { usePreloadFeatures } from "@/hooks/use-features";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import {
    loadBrowserEnv,
    loadWorkspaceDraft,
    mergeBrowserEnv,
    saveBrowserEnv,
    saveWorkspaceDraft,
} from "@/lib/browser-storage";
import { AppView } from "./app-view/app-view";
import { BrandMark } from "./brand-mark";
import { ModeSwitch } from "./mode-switch";
import SmartIsland from "./smart-island";
import { TidyLayoutButton } from "./tidy-layout-button";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { WorkspaceLeftNav } from "./workspace-left-nav";
import { WorkspaceNav } from "./workspace-nav";

/**
 * Workspace inner component
 * Must be used inside a ReactFlowProvider
 */
function WorkspaceInner({
    user: _user,
}: {
    user?: { id: string; email: string };
}) {
    const tIndex = useTranslations("Index");
    const locale = useLocale();

    // App mode replaces the canvas with a form view. The ReactFlow tree stays
    // mounted (visibility-hidden) so SSE output application and workflow
    // recovery keep working while it's covered.
    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const isAppMode = workspaceMode === "app";

    // Preload feature data
    usePreloadFeatures();

    // IndexedDB owns each visitor's BYOK settings, while Python plugins run
    // server-side. Reconcile them on page load so a connected badge can never
    // disagree with the environment inherited by the plugin subprocess.
    useEffect(() => {
        void (async () => {
            try {
                const data = await apiGet<{
                    env: Record<string, string>;
                }>("/api/settings/env");
                const browserEnv = await loadBrowserEnv();
                if (!browserEnv) return;
                const env = mergeBrowserEnv(data.env ?? {}, browserEnv);
                await apiPut("/api/settings/env", { env });
                await saveBrowserEnv(env);
            } catch (error) {
                logger.error("Failed to sync browser settings:", error);
            }
        })();
    }, []);

    // Node data update callback (does not depend on nodes; gets the latest state directly from the store)
    const handleNodeDataUpdate = useCallback(
        (nodeId: string, data: { fileKeys?: string[]; texts?: string[] }) => {
            const currentNodes = useFlow.getState().nodes;
            const node = currentNodes.find((n) => n.id === nodeId);
            if (node) {
                const currentData =
                    (node.data as Record<string, unknown>) || {};
                const newData: Record<string, unknown> = { ...currentData };
                if (data.fileKeys && data.fileKeys.length > 0) {
                    newData.fileKeys = data.fileKeys;
                }
                if (data.texts && data.texts.length > 0) {
                    newData.texts = data.texts;
                }
                // Programmatic task-result write — not an undoable user action
                useFlow.getState().updates(nodeId, newData, {
                    history: false,
                });
            }
        },
        [],
    );

    // Workflow task recovery hook
    useWorkflowRecovery({
        onNodeDataUpdate: handleNodeDataUpdate,
    });

    // Restore the canvas from IndexedDB. Existing localStorage drafts are
    // migrated once so upgrades do not discard a visitor's current work.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                let draft = await loadWorkspaceDraft();
                if (!draft) {
                    const legacyNodes = localStorage.getItem("nodes");
                    const legacyEdges = localStorage.getItem("edges");
                    const legacyMeta = localStorage.getItem("workflowMeta");
                    if (legacyNodes !== null || legacyEdges !== null) {
                        draft = {
                            nodes: legacyNodes ? JSON.parse(legacyNodes) : [],
                            edges: legacyEdges ? JSON.parse(legacyEdges) : [],
                            meta: legacyMeta
                                ? JSON.parse(legacyMeta)
                                : {
                                      id: null,
                                      name: "",
                                      description: "",
                                  },
                        };
                        await saveWorkspaceDraft(draft);
                        localStorage.removeItem("nodes");
                        localStorage.removeItem("edges");
                        localStorage.removeItem("workflowMeta");
                        localStorage.removeItem("exampleLoaded");
                    }
                }

                if (cancelled) return;
                if (draft) {
                    useFlow.setState({
                        nodes: draft.nodes,
                        edges: draft.edges,
                        workflowId: draft.meta.id,
                        workflowName:
                            draft.meta.id && draft.meta.name
                                ? draft.meta.name
                                : tIndex("title"),
                        workflowDescription: draft.meta.description || "",
                    });
                    return;
                }

                const response = await fetch("/example.json");
                const parsed = parseWorkflowImportJson(await response.json());
                if (cancelled) return;
                useFlow.setState({
                    nodes: parsed.nodes,
                    edges: parsed.edges,
                    workflowName: parsed.name || tIndex("title"),
                    workflowDescription: parsed.description || "",
                });
            } catch (error) {
                logger.error("Failed to restore the browser workspace:", error);
                useFlow.setState({ workflowName: tIndex("title") });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [tIndex]);

    // The whole current document is one small IndexedDB record. A single
    // debounced subscription keeps edits durable without re-rendering the shell.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const unsubscribe = useFlow.subscribe((state, previous) => {
            if (
                state.nodes === previous.nodes &&
                state.edges === previous.edges &&
                state.workflowId === previous.workflowId &&
                state.workflowName === previous.workflowName &&
                state.workflowDescription === previous.workflowDescription
            ) {
                return;
            }
            clearTimeout(timer);
            timer = setTimeout(() => {
                void saveWorkspaceDraft({
                    nodes: state.nodes,
                    edges: state.edges,
                    meta: {
                        id: state.workflowId,
                        name: state.workflowId ? state.workflowName : "",
                        description: state.workflowDescription,
                    },
                }).catch((error) =>
                    logger.error("Failed to save browser workspace:", error),
                );
            }, 500);
        });
        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, []);

    // Listen for locale changes: if the workflow is unsaved, update the name to the default for the new locale
    useEffect(() => {
        const workflowId = useFlow.getState().workflowId;
        if (!workflowId) {
            // Unsaved workflow — update the name to the default for the current locale
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, [locale, tIndex]);

    return (
        <div className="flex w-full h-full">
            <div className="relative flex-1 min-w-0 h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background">
                <FlowCanvas hidden={isAppMode}>
                    <SmartIsland />
                </FlowCanvas>

                {isAppMode && (
                    <div className="absolute inset-0 z-5 overflow-y-auto bg-background">
                        <AppView />
                    </div>
                )}

                <div className="absolute left-5 top-5 z-10 flex items-center gap-3">
                    <BrandMark />
                    <WorkflowTitleMenu />
                    <WorkspaceLeftNav />
                    <UndoRedoButtons />
                    <TidyLayoutButton />
                </div>

                <div className="absolute right-5 top-5 z-10 flex items-center gap-3">
                    <WorkspaceNav />
                </div>

                <div className="absolute right-4 bottom-5 z-10">
                    <ModeSwitch />
                </div>
            </div>
        </div>
    );
}

/**
 * Workspace main component (with Provider)
 */
export default function Workspace({
    user,
}: {
    user?: { id: string; email: string };
}) {
    return (
        <ReactFlowProvider>
            <WorkspaceInner user={user} />
        </ReactFlowProvider>
    );
}
