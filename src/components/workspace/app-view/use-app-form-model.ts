"use client";

/**
 * Derives the app-mode form model from the live canvas graph.
 *
 * Reuses the workflow exporter: level-0 data / Add nodes become form fields,
 * `outputs` (leaf data nodes) become the results section. Values are read
 * live from the canvas nodes so the form and the canvas stay in sync in both
 * directions, and SSE-applied outputs show up as soon as `expands` merges
 * them into the downstream data nodes.
 *
 * The exporter resolves executable nodes through the ABI mount registry,
 * which is populated by the (hidden but mounted) canvas node components in
 * their mount effects — i.e. *after* the render in which a nodes change is
 * first seen. The `tick` effect below re-derives once per nodes/edges change
 * so the memo always settles on a fully-registered graph.
 */

import type { Edge, Node } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type {
    DataNode,
    WorkflowOutput,
} from "@/lib/workflow/executable-workflow";
import { DATA_NODE_TYPES } from "@/lib/workflow/executable-workflow";
import { exportWorkflow } from "@/lib/workflow/exporter";
import { WorkflowParser } from "@/lib/workflow/parser";

export type AppFormErrorState = "empty" | "invalid" | "nothingToRun" | null;

export interface AppFieldValue {
    texts?: string[];
    fileKeys?: string[];
}

export interface AppFormField {
    /** Level-0 canvas node backing this field (data node or Add node). */
    nodeId: string;
    /** True when the backing node is an Add node (value lives downstream). */
    isAddNode: boolean;
    /** Data node type an Add-node field spawns/merges via `expands`. */
    expandType: string;
    dataType: DataNode["dataType"];
    label?: string;
    /** Field must have a value before the workflow can run. */
    required: boolean;
    /** Current value, read live from the canvas. */
    value: AppFieldValue;
}

export interface AppOutputItem {
    nodeId: string;
    type: WorkflowOutput["type"];
    /** Current values (fileKeys or texts), read live from the canvas. */
    values: string[];
    /** True when the values are file keys (vs raw text). */
    isFileValues: boolean;
}

export interface AppFormModel {
    error: AppFormErrorState;
    fields: AppFormField[];
    outputs: AppOutputItem[];
    totalSteps: number;
    /** Executable node id -> display label, for progress rendering. */
    stepLabels: Map<string, string>;
}

/** addImageNode -> imageNode, addLinkNode -> linkNode, ... */
function addNodeToDataNodeType(addType: string): string {
    const stripped = addType.replace(/^add/, "");
    return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

function nodeData(
    nodes: Node[],
    nodeId: string,
): Record<string, unknown> | undefined {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.data as Record<string, unknown> | undefined;
}

/**
 * The canvas node whose `data` holds an Add-node field's current value: the
 * first downstream data node of the expected type, if one exists.
 */
export function findAddNodeValueTarget(
    addNodeId: string,
    expandType: string,
    nodes: Node[],
    edges: Edge[],
): string | undefined {
    const edge = edges.find((e) => {
        if (e.source !== addNodeId) return false;
        const target = nodes.find((n) => n.id === e.target);
        return target?.type === expandType;
    });
    return edge?.target;
}

function readFieldValue(
    dataNode: DataNode,
    expandType: string,
    nodes: Node[],
    edges: Edge[],
): AppFieldValue {
    const isAdd = !DATA_NODE_TYPES[dataNode.type];
    if (!isAdd) {
        const data = nodeData(nodes, dataNode.id);
        return {
            texts: data?.texts as string[] | undefined,
            fileKeys: data?.fileKeys as string[] | undefined,
        };
    }
    // Add node: prefer the downstream data node (where uploads land), then
    // the Add node's own data (manualValue covers addTextNode manual input).
    const downstreamId = findAddNodeValueTarget(
        dataNode.id,
        expandType,
        nodes,
        edges,
    );
    if (downstreamId) {
        const data = nodeData(nodes, downstreamId);
        const texts = data?.texts as string[] | undefined;
        const fileKeys = data?.fileKeys as string[] | undefined;
        if ((texts && texts.length > 0) || (fileKeys && fileKeys.length > 0)) {
            return { texts, fileKeys };
        }
    }
    const own = nodeData(nodes, dataNode.id);
    const ownTexts = own?.texts as string[] | undefined;
    const manualValue = own?.manualValue as string | undefined;
    return {
        texts:
            ownTexts && ownTexts.length > 0
                ? ownTexts
                : manualValue
                  ? [manualValue]
                  : undefined,
        fileKeys: own?.fileKeys as string[] | undefined,
    };
}

function hasValue(value: AppFieldValue): boolean {
    return (
        (value.texts?.some((t) => t.trim().length > 0) ?? false) ||
        (value.fileKeys?.length ?? 0) > 0
    );
}

export function fieldHasValue(field: AppFormField): boolean {
    return hasValue(field.value);
}

export function useAppFormModel(nodes: Node[], edges: Edge[]): AppFormModel {
    // Canvas node components register their ABI specs in mount effects, which
    // run after the render where a nodes change first appears. Bumping a tick
    // afterwards re-runs the memo against the fully-populated registry.
    const [tick, setTick] = useState(0);
    useEffect(() => {
        setTick((t) => t + 1);
    }, [nodes, edges]);

    return useMemo<AppFormModel>(() => {
        void tick;
        if (nodes.length === 0) {
            return {
                error: "empty",
                fields: [],
                outputs: [],
                totalSteps: 0,
                stepLabels: new Map(),
            };
        }

        // A cycle keeps nodes out of every execution level and the exporter
        // silently drops them — reject the graph up front instead.
        if (!new WorkflowParser({ nodes, edges }).isValid()) {
            return {
                error: "invalid",
                fields: [],
                outputs: [],
                totalSteps: 0,
                stepLabels: new Map(),
            };
        }

        const executable = exportWorkflow(nodes, edges, {
            includeOriginalFlow: false,
        });

        const fields: AppFormField[] = executable.dataNodes
            .filter((d) => d.level === 0)
            .map((d) => {
                const isAddNode = !DATA_NODE_TYPES[d.type];
                const expandType = isAddNode
                    ? addNodeToDataNodeType(d.type)
                    : d.type;
                const value = readFieldValue(d, expandType, nodes, edges);
                return {
                    nodeId: d.id,
                    isAddNode,
                    expandType,
                    dataType: d.dataType,
                    label: d.label,
                    required: true,
                    value,
                };
            });

        if (executable.executableNodes.length === 0) {
            return {
                error: "nothingToRun",
                fields,
                outputs: [],
                totalSteps: 0,
                stepLabels: new Map(),
            };
        }

        const fieldNodeIds = new Set(fields.map((f) => f.nodeId));
        const outputs: AppOutputItem[] = executable.outputs
            // A dangling level-0 node is both a field and a leaf; showing it
            // in the results section would just mirror the input.
            .filter((o) => !fieldNodeIds.has(o.nodeId))
            .map((o) => {
                const data = nodeData(nodes, o.nodeId);
                const isFileValues = o.field === "fileKeys";
                const values =
                    (data?.[o.field] as string[] | undefined)?.filter(
                        (v) => v && v.length > 0,
                    ) ?? [];
                return { nodeId: o.nodeId, type: o.type, values, isFileValues };
            });

        const stepLabels = new Map<string, string>(
            executable.executableNodes.map((n) => [n.id, n.label ?? n.type]),
        );

        return {
            error: null,
            fields,
            outputs,
            totalSteps: executable.executableNodes.length,
            stepLabels,
        };
    }, [nodes, edges, tick]);
}
