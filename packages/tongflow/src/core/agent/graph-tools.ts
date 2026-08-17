/**
 * Agent graph tools — the programmatic editing surface over a headless
 * `FlowStore`.
 *
 * Every mutation goes through the same store actions the canvas uses
 * (`addNode` / `expands` / `updates` / `removeNode` / `autoLayout`), so an
 * agent-built graph gets ABI handle resolution, layout and one undo entry per
 * turn for free. Synchronous and host-agnostic: pacing ("watch it build"),
 * camera follow and persistence belong to the host.
 */

import type { Edge, Node } from "@xyflow/react";
import { getAbiTopology } from "../abi/handle-introspect";
import {
    NODE_TYPE_TO_ABI_FEATURE,
    resolvedSpecForNodeType,
    resolveEdgeHandles,
} from "../abi/node-feature-registry";
import { MODALITY_NODE_TYPES } from "../constants/modality-nodes";
import type { FlowStore } from "../store/flow-store";
import { isValidFlowConnection } from "../workflow/connection-rules";
import { isWorkflowValid } from "../workflow/parser";
import { neighborhood, renderCanvas, resolveNodeRef } from "./serialize";
import type {
    AgentAttachment,
    GraphPatch,
    GraphPatchAddNode,
    PatchStepResult,
    ToolResult,
} from "./types";

/* ------------------------------------------------------------------ */
/* Node-type knowledge                                                 */
/* ------------------------------------------------------------------ */

/** Known add-node types (user-input widgets) accepted in patches. */
export const ADD_NODE_TYPES: ReadonlySet<string> = new Set([
    "addTextNode",
    "addImageNode",
    "addVideoNode",
    "addAudioNode",
    "addFileNode",
    "addModelNode",
    "addLinkNode",
]);

/** Every canvas node type an agent may create. */
export const KNOWN_NODE_TYPES: readonly string[] = [
    ...Object.keys(NODE_TYPE_TO_ABI_FEATURE),
    ...MODALITY_NODE_TYPES,
    ...ADD_NODE_TYPES,
];

export function isKnownNodeType(type: string): boolean {
    return KNOWN_NODE_TYPES.includes(type);
}

/** Closest known node types for a typo'd `input` (cheap n-gram similarity). */
export function closestNodeTypes(input: string, count = 3): string[] {
    const lower = input.toLowerCase();
    const scored = KNOWN_NODE_TYPES.map((t) => {
        const tl = t.toLowerCase();
        let score = 0;
        if (tl.includes(lower) || lower.includes(tl.replace(/node$/, ""))) {
            score += 10;
        }
        // Shared 4-grams as a cheap similarity signal.
        for (let i = 0; i + 4 <= lower.length; i++) {
            if (tl.includes(lower.slice(i, i + 4))) score++;
        }
        return { t, score };
    });
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map((s) => s.t);
}

export type NodeKind = "add" | "data" | "executable";

export function nodeKind(type: string | undefined): NodeKind | undefined {
    if (!type) return undefined;
    if (ADD_NODE_TYPES.has(type)) return "add";
    if ((MODALITY_NODE_TYPES as readonly string[]).includes(type)) {
        return "data";
    }
    if (type in NODE_TYPE_TO_ABI_FEATURE) return "executable";
    return undefined;
}

/**
 * Enforce the canonical alternation `add → data → executable → data → …`.
 * Executables must never wire directly to each other: at run time a consumer
 * reads its input from the upstream node's data, and an executable's results
 * land on its downstream data node — a direct edge would read nothing.
 */
export function edgeShapeError(
    sourceType: string | undefined,
    targetType: string | undefined,
): string | undefined {
    const s = nodeKind(sourceType);
    const t = nodeKind(targetType);
    if (!s || !t) return undefined;

    if (s === "executable" && t === "executable") {
        const feature = NODE_TYPE_TO_ABI_FEATURE[sourceType ?? ""];
        const outType = feature
            ? getAbiTopology(feature).outputs[0]?.nodeType
            : undefined;
        return `executables never connect directly — insert an empty ${
            outType ?? "data"
        } node between ${sourceType} and ${targetType} (results land on the data node; the next executable reads from it)`;
    }
    if (s === "data" && t === "data") {
        return "data nodes never connect to each other";
    }
    if (s === "add" && t !== "data") {
        return `an add node feeds its data node first (${sourceType} → data node → ${targetType})`;
    }
    if (t === "add") {
        return "add nodes are workflow inputs and take no incoming edges";
    }
    return undefined;
}

function attachmentData(
    node: GraphPatchAddNode,
    attachments: AgentAttachment[],
): { data?: Record<string, unknown>; error?: string } {
    if (node.fromAttachment === undefined) return { data: node.data };
    const att = attachments.find((a) => a.index === node.fromAttachment);
    if (!att) {
        return {
            error: `attachment #${node.fromAttachment} does not exist (have ${attachments.length})`,
        };
    }
    if (node.type === "addTextNode" || node.type === "textNode") {
        return { error: "attachments carry files; use fileKeys-based nodes" };
    }
    return {
        data: {
            ...node.data,
            fileKeys: [att.fileKey],
            ...(ADD_NODE_TYPES.has(node.type) ? { activeTab: "upload" } : {}),
        },
    };
}

/* ------------------------------------------------------------------ */
/* apply_graph_patch                                                   */
/* ------------------------------------------------------------------ */

export interface ApplyGraphPatchOptions {
    /** Files the user attached; referenced by `fromAttachment` (1-based). */
    attachments?: AgentAttachment[];
    /**
     * History source label for the single undo snapshot this patch commits
     * (e.g. `agent:<turnId>`). Same-source commits coalesce.
     */
    historySource?: string;
    /** Edge id factory (defaults to `crypto.randomUUID`). */
    createId?: () => string;
    /** Called after each successful step — hosts use it for pacing/camera. */
    onStep?: (step: PatchStepResult) => void;
}

/**
 * Apply one coherent change (nodes to create, edges to draw, params to set,
 * nodes to delete) to `store`. Returns per-step results; `ok` is true only
 * when every step succeeded.
 */
export function applyGraphPatch(
    store: FlowStore,
    patch: GraphPatch,
    options: ApplyGraphPatchOptions = {},
): ToolResult {
    const attachments = options.attachments ?? [];
    const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    const results: PatchStepResult[] = [];
    const record = (step: PatchStepResult) => {
        results.push(step);
        if (step.ok) options.onStep?.(step);
    };
    const aliases = new Map<string, string>();
    // Edges already claimed per target within this patch, so several sources
    // land on distinct handles (mirrors compose()'s usedTargetHandles).
    const usedTargetHandles = new Map<string, Set<string>>();

    const hasSteps =
        (patch.add_nodes?.length ?? 0) +
            (patch.add_edges?.length ?? 0) +
            (patch.update_nodes?.length ?? 0) +
            (patch.remove_nodes?.length ?? 0) >
        0;
    if (!hasSteps) {
        return { ok: false, error: "empty patch" };
    }

    // One history snapshot per patch → one undo reverts it all.
    store.getState().commitHistory(options.historySource ?? "agent");

    const pendingNodes = [...(patch.add_nodes ?? [])];
    let pendingEdges = [...(patch.add_edges ?? [])];

    /* ---- structural pre-pass: reject shape-invalid edges ------------ */

    // Node types are known before anything materializes (aliases from this
    // patch, existing nodes from the canvas), so alternation violations fail
    // fast with a repair hint instead of half-applying.
    const typeByAlias = new Map(pendingNodes.map((n) => [n.alias, n.type]));
    const refType = (ref: string): string | undefined => {
        const aliased = typeByAlias.get(ref);
        if (aliased) return aliased;
        const nodes = store.getState().nodes;
        const resolved = resolveNodeRef(ref, nodes);
        return resolved.id
            ? nodes.find((n) => n.id === resolved.id)?.type
            : undefined;
    };
    pendingEdges = pendingEdges.filter((e) => {
        const error = edgeShapeError(refType(e.from), refType(e.to));
        if (!error) return true;
        record({
            op: "add_edge",
            ref: `${e.from}→${e.to}`,
            ok: false,
            error,
            hint: "the graph must alternate: add node → data node → executable → data node → …",
        });
        return false;
    });

    /* ---- add_nodes + their first incoming edge (via expands) -------- */

    for (const spec of pendingNodes) {
        if (!isKnownNodeType(spec.type)) {
            record({
                op: "add_node",
                ref: spec.alias,
                ok: false,
                error: `unknown node type "${spec.type}"`,
                hint: `closest known types: ${closestNodeTypes(spec.type).join(", ")}`,
            });
            continue;
        }
        const { data, error } = attachmentData(spec, attachments);
        if (error) {
            record({ op: "add_node", ref: spec.alias, ok: false, error });
            continue;
        }

        const nodeData: Record<string, unknown> = { ...data };
        if (spec.pluginId) nodeData.pluginId = spec.pluginId;
        if (spec.pluginModel) nodeData.pluginModel = spec.pluginModel;

        // If this node's first incoming edge originates from an
        // already-materialized node, create node+edge in one `expands` call:
        // it derives handles and lays out the child.
        const edgeIdx = pendingEdges.findIndex((e) => {
            if (e.to !== spec.alias) return false;
            const from = resolveNodeRef(
                e.from,
                store.getState().nodes,
                aliases,
            );
            return !!from.id;
        });

        let newId: string | undefined;
        let reused = false;

        if (edgeIdx >= 0) {
            const edge = pendingEdges[edgeIdx];
            const from = resolveNodeRef(
                edge.from,
                store.getState().nodes,
                aliases,
            );
            const before = new Set(store.getState().nodes.map((n) => n.id));
            const ids = store
                .getState()
                .expands(from.id ?? null, [
                    { type: spec.type, data: nodeData },
                ]);
            newId = ids[0];
            reused = newId !== undefined && before.has(newId);
            if (newId) {
                pendingEdges.splice(edgeIdx, 1);
                const targetHandle = store
                    .getState()
                    .edges.find(
                        (e) => e.source === from.id && e.target === newId,
                    )?.targetHandle;
                if (targetHandle) {
                    const used =
                        usedTargetHandles.get(newId) ?? new Set<string>();
                    used.add(targetHandle);
                    usedTargetHandles.set(newId, used);
                }
            }
        } else {
            newId = store.getState().addNode({
                type: spec.type,
                data: nodeData,
            });
        }

        if (!newId) {
            record({
                op: "add_node",
                ref: spec.alias,
                ok: false,
                error: "node creation failed",
            });
            continue;
        }

        aliases.set(spec.alias, newId);
        record({
            op: "add_node",
            ref: spec.alias,
            ok: true,
            nodeId: newId,
            ...(reused ? { reused: true } : {}),
        });
    }

    /* ---- remaining edges (cross-links, fan-ins) --------------------- */

    for (const spec of pendingEdges) {
        const state = store.getState();
        const from = resolveNodeRef(spec.from, state.nodes, aliases);
        const to = resolveNodeRef(spec.to, state.nodes, aliases);
        const refLabel = `${spec.from}→${spec.to}`;

        const missing = !from.id ? spec.from : !to.id ? spec.to : undefined;
        if (missing) {
            record({
                op: "add_edge",
                ref: refLabel,
                ok: false,
                error:
                    from.ambiguous || to.ambiguous
                        ? `reference "${missing}" is ambiguous`
                        : `reference "${missing}" not found`,
                hint: "use an alias from this patch or a short id from the canvas listing",
            });
            continue;
        }

        const fromNode = state.nodes.find((n) => n.id === from.id) as Node;
        const toNode = state.nodes.find((n) => n.id === to.id) as Node;

        const used = usedTargetHandles.get(toNode.id) ?? new Set<string>();
        for (const e of state.edges) {
            if (e.target === toNode.id && e.targetHandle) {
                // Existing single-value edges also occupy their handle;
                // batch/collect handles accept repeats and are re-picked by
                // resolveEdgeHandles anyway.
                used.add(e.targetHandle);
            }
        }

        const derived = resolveEdgeHandles({
            sourceType: fromNode.type,
            targetType: toNode.type,
            usedTargetHandles: used,
            targetSpec: resolvedSpecForNodeType(toNode.type),
        });
        const sourceHandle = spec.fromHandle ?? derived.sourceHandle;
        const targetHandle = spec.toHandle ?? derived.targetHandle;

        const connection = {
            source: fromNode.id,
            target: toNode.id,
            sourceHandle: sourceHandle ?? null,
            targetHandle: targetHandle ?? null,
        };

        if (!isValidFlowConnection(connection, state.nodes, state.edges)) {
            record({
                op: "add_edge",
                ref: refLabel,
                ok: false,
                error: `connection rejected (${fromNode.type} → ${toNode.type}${targetHandle ? ` on ${targetHandle}` : ""})`,
                hint: "check the catalog: the target field's modality must match the source output, and single-value inputs accept only one edge",
            });
            continue;
        }

        const edge: Edge = {
            id: createId(),
            source: fromNode.id,
            target: toNode.id,
            type: "custom-edge",
            ...(sourceHandle ? { sourceHandle } : {}),
            ...(targetHandle ? { targetHandle } : {}),
        };
        store.getState().setEdges([...store.getState().edges, edge]);
        if (targetHandle) {
            used.add(targetHandle);
            usedTargetHandles.set(toNode.id, used);
        }

        record({ op: "add_edge", ref: refLabel, ok: true });
    }

    /* ---- update_nodes ---------------------------------------------- */

    for (const spec of patch.update_nodes ?? []) {
        const state = store.getState();
        const ref = resolveNodeRef(spec.id, state.nodes, aliases);
        if (!ref.id) {
            record({
                op: "update_node",
                ref: spec.id,
                ok: false,
                error: ref.ambiguous
                    ? `reference "${spec.id}" is ambiguous`
                    : `node "${spec.id}" not found`,
                hint: "re-read the canvas; the node may have been removed",
            });
            continue;
        }
        if ("prompt" in spec.data) {
            record({
                op: "update_node",
                ref: spec.id,
                ok: false,
                error: "'prompt' is derived at run time and cannot be set",
                hint: "set the node's own fields (e.g. text, duration) instead",
            });
            continue;
        }
        // `updates()` replaces node.data wholesale — merge with the current
        // data or it would wipe params and file keys. The patch-level commit
        // already snapshotted history; skip per-update commits so one undo
        // reverts the whole patch.
        const node = state.nodes.find((n) => n.id === ref.id);
        if (node) {
            state.updates(
                ref.id,
                { ...node.data, ...spec.data },
                { history: false },
            );
        }
        record({ op: "update_node", ref: spec.id, ok: true });
    }

    /* ---- remove_nodes ----------------------------------------------- */

    for (const refStr of patch.remove_nodes ?? []) {
        const state = store.getState();
        const ref = resolveNodeRef(refStr, state.nodes, aliases);
        if (!ref.id) {
            record({
                op: "remove_node",
                ref: refStr,
                ok: false,
                error: ref.ambiguous
                    ? `reference "${refStr}" is ambiguous`
                    : `node "${refStr}" not found`,
            });
            continue;
        }
        store.getState().removeNode(ref.id);
        record({ op: "remove_node", ref: refStr, ok: true });
    }

    // Tidy the components this patch touched. No separate history entry —
    // the patch-level snapshot already covers it, so one undo still reverts
    // the whole patch including the layout.
    const touchedIds = results
        .filter((r) => r.ok && r.nodeId)
        .map((r) => r.nodeId as string);
    for (const spec of patch.update_nodes ?? []) {
        const ref = resolveNodeRef(spec.id, store.getState().nodes, aliases);
        if (ref.id) touchedIds.push(ref.id);
    }
    if (touchedIds.length > 0) {
        store.getState().autoLayout(touchedIds, { history: false });
    }

    const failed = results.filter((r) => !r.ok);
    return {
        ok: failed.length === 0,
        ...(failed.length > 0
            ? {
                  error: `${failed.length}/${results.length} step(s) failed`,
              }
            : {}),
        steps: results,
    } as ToolResult;
}

/* ------------------------------------------------------------------ */
/* read_canvas                                                         */
/* ------------------------------------------------------------------ */

export interface ReadCanvasOptions {
    /** `"all"` (default), `"selection"`, or `"around:<ref>"`. */
    scope?: string;
    /** Live execution status per node id, if the host tracks it. */
    statusByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
    /** Truncate long text values (default 200 chars). */
    maxText?: number;
}

export function readCanvas(
    store: FlowStore,
    options: ReadCanvasOptions = {},
): ToolResult {
    const { nodes, edges, selectedNodes } = store.getState();
    const { scope, statusByNodeId, maxText = 200 } = options;

    let only: Set<string> | undefined;
    if (scope === "selection") {
        only = new Set(selectedNodes.map((n) => n.id));
        if (only.size === 0) {
            return { ok: false, error: "nothing is selected" };
        }
    } else if (scope?.startsWith("around:")) {
        const ref = resolveNodeRef(scope.slice("around:".length), nodes);
        if (!ref.id) {
            return { ok: false, error: `node "${scope}" not found` };
        }
        only = neighborhood(ref.id, edges);
    }

    const statusMap =
        statusByNodeId instanceof Map
            ? statusByNodeId
            : statusByNodeId
              ? new Map(Object.entries(statusByNodeId))
              : undefined;
    return {
        ok: true,
        canvas: renderCanvas(nodes, edges, {
            selectedIds: selectedNodes.map((n) => n.id),
            statusByNodeId: statusMap,
            maxText,
            only,
        }),
    };
}

/* ------------------------------------------------------------------ */
/* validate_workflow                                                   */
/* ------------------------------------------------------------------ */

/** The subset of the plugins registry validation needs. */
export interface InstalledPluginsView {
    /** ABI slot → installed plugin ids (default first). */
    nodePluginMap?: Record<string, string[]>;
}

export interface ValidateWorkflowOptions {
    /**
     * Installed plugins, so validation can flag slots with no implementation
     * or a `pluginId` that isn't installed. Omit to skip plugin checks.
     */
    registry?: InstalledPluginsView | null;
}

export function validateWorkflow(
    store: FlowStore,
    options: ValidateWorkflowOptions = {},
): ToolResult {
    const { nodes, edges } = store.getState();
    const registry = options.registry;
    const problems: string[] = [];

    if (nodes.length === 0) return { ok: true, problems: ["canvas is empty"] };
    if (!isWorkflowValid({ nodes, edges })) {
        problems.push("the graph contains a cycle");
    }

    // Alternation invariant: an executable's results land on its downstream
    // data node, so a direct executable→executable edge reads nothing at
    // run time.
    const typeById = new Map(nodes.map((n) => [n.id, n.type]));
    for (const e of edges) {
        const error = edgeShapeError(
            typeById.get(e.source),
            typeById.get(e.target),
        );
        if (error) {
            problems.push(
                `edge #${e.source.slice(0, 8)}→#${e.target.slice(0, 8)}: ${error}`,
            );
        }
    }

    for (const node of nodes) {
        const feature = NODE_TYPE_TO_ABI_FEATURE[node.type ?? ""];
        const spec = resolvedSpecForNodeType(node.type);
        if (!feature || !spec) continue;
        const short = `#${node.id.slice(0, 8)} ${node.type}`;
        const data = (node.data ?? {}) as Record<string, unknown>;

        for (const [field, resolved] of Object.entries(spec.fields)) {
            if (!resolved.required) continue;
            if (resolved.kind === "handle") {
                const wired = edges.some(
                    (e) =>
                        e.target === node.id &&
                        (!e.targetHandle || e.targetHandle === `in:${field}`),
                );
                const manualValue =
                    resolved.manual &&
                    data[field] !== undefined &&
                    data[field] !== "";
                if (!wired && !manualValue) {
                    problems.push(
                        `${short}: required input "${field}" is not connected`,
                    );
                }
            } else if (resolved.kind === "config") {
                if (data[field] === undefined || data[field] === "") {
                    problems.push(
                        `${short}: required config "${field}" is empty`,
                    );
                }
            }
        }

        if (registry) {
            const installed = registry.nodePluginMap?.[feature] ?? [];
            if (installed.length === 0) {
                problems.push(`${short}: no plugin installed for "${feature}"`);
            } else if (
                typeof data.pluginId === "string" &&
                data.pluginId &&
                !installed.includes(data.pluginId)
            ) {
                problems.push(
                    `${short}: plugin "${data.pluginId}" is not installed (available: ${installed.join(", ")})`,
                );
            }
        }
    }

    return { ok: true, valid: problems.length === 0, problems };
}

/* ------------------------------------------------------------------ */
/* describe_node_type                                                  */
/* ------------------------------------------------------------------ */

export function describeNodeType(type: string): ToolResult {
    if (!isKnownNodeType(type)) {
        return {
            ok: false,
            error: `unknown node type "${type}"`,
            hint: `closest known types: ${closestNodeTypes(type).join(", ")}`,
        };
    }
    const feature = NODE_TYPE_TO_ABI_FEATURE[type];
    const spec = resolvedSpecForNodeType(type);
    if (!feature || !spec) {
        return {
            ok: true,
            type,
            kind: "data-node",
            note: "carries assets; data keys are texts (textNode/linkNode) or fileKeys (other modalities)",
        };
    }
    const { topology } = spec;
    const fields: Record<string, unknown> = {};
    for (const field of topology.inputOrder) {
        const resolved = spec.fields[field];
        const cls = topology.inputs[field];
        fields[field] =
            resolved.kind === "handle"
                ? {
                      kind: "wire",
                      from: resolved.nodeType,
                      batch: resolved.batch ?? false,
                      collect: resolved.collect ?? false,
                      configFallback: resolved.manual ?? false,
                      required: resolved.required,
                  }
                : {
                      kind: resolved.kind,
                      required: resolved.required,
                      schema: cls.kind === "config" ? cls.schema : undefined,
                  };
    }
    return {
        ok: true,
        type,
        feature,
        fields,
        outputs: topology.outputs,
    };
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export interface ExecuteToolContext
    extends ApplyGraphPatchOptions,
        ValidateWorkflowOptions {
    /** Live execution status per node id (for `read_canvas`). */
    statusByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
}

/**
 * Dispatch one of the `TONGFLOW_TOOL_DEFS` tools by name. Unknown names are
 * reported as a tool error so hosts can layer their own tools on top.
 */
export function executeGraphTool(
    store: FlowStore,
    name: string,
    args: Record<string, unknown>,
    context: ExecuteToolContext = {},
): ToolResult {
    switch (name) {
        case "apply_graph_patch":
            return applyGraphPatch(store, args as GraphPatch, context);
        case "read_canvas":
            return readCanvas(store, {
                scope: typeof args.scope === "string" ? args.scope : undefined,
                statusByNodeId: context.statusByNodeId,
            });
        case "validate_workflow":
            return validateWorkflow(store, { registry: context.registry });
        case "describe_node_type":
            return describeNodeType(String(args.type ?? ""));
        default:
            return { ok: false, error: `unknown tool "${name}"` };
    }
}
