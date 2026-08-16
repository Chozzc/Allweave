"use client";

/**
 * Client-side agent tool dispatch.
 *
 * All canvas mutations go through the same `useFlow` store actions the UI
 * uses, so agent-built nodes get automatic layout, ABI handle resolution,
 * camera-follow and undo for free. The patch applier paces its steps so the
 * user watches the workflow grow instead of it popping in at once.
 */

import type { Edge, Node } from "@xyflow/react";
import type {
    AgentAttachment,
    GraphPatch,
    GraphPatchAddNode,
    PatchStepResult,
    ToolResult,
} from "tongflow";
import {
    exportWorkflow,
    getAbiTopology,
    isValidFlowConnection,
    isWorkflowValid,
    logger,
    MODALITY_NODE_TYPES,
    NODE_TYPE_SOURCE_SPEC,
    NODE_TYPE_TO_ABI_FEATURE,
    neighborhood,
    parseWorkflowImportJson,
    renderCanvas,
    resolvedSpecForNodeType,
    resolveEdgeHandles,
    resolveNodeRef,
    resolveSpec,
} from "tongflow";
import { v4 } from "uuid";
import useFlow from "@/hooks/use-flow";
import { usePluginsRegistryStore } from "@/hooks/use-plugins-registry";
import { useTaskStore } from "@/hooks/use-task";
import { getWorkflow, listWorkflows, saveWorkflow } from "@/lib/api/workspace";

/** Known add-node types (user-input widgets) accepted in patches. */
const ADD_NODE_TYPES = new Set([
    "addTextNode",
    "addImageNode",
    "addVideoNode",
    "addAudioNode",
    "addFileNode",
    "addModelNode",
    "addLinkNode",
]);

const KNOWN_NODE_TYPES: string[] = [
    ...Object.keys(NODE_TYPE_TO_ABI_FEATURE),
    ...MODALITY_NODE_TYPES,
    ...ADD_NODE_TYPES,
];

/** Delay between patch steps so the build reads as a sequence, not a pop. */
const STEP_PACING_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function closestTypes(input: string, count = 3): string[] {
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

function isKnownType(type: string): boolean {
    return KNOWN_NODE_TYPES.includes(type);
}

/**
 * `updates()` replaces node.data wholesale — every agent write must merge
 * with the node's current data or it would wipe params and file keys.
 */
function mergeNodeData(nodeId: string, patch: Record<string, unknown>): void {
    const flow = useFlow.getState();
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    // The turn-level commit already snapshotted history; skip per-update
    // commits so one Cmd+Z reverts the whole agent turn.
    flow.updates(nodeId, { ...node.data, ...patch }, { history: false });
}

type NodeKind = "add" | "data" | "executable";

function nodeKind(type: string | undefined): NodeKind | undefined {
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
function edgeShapeError(
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

export async function applyGraphPatch(
    patch: GraphPatch,
    attachments: AgentAttachment[],
    turnId: string,
): Promise<ToolResult> {
    const results: PatchStepResult[] = [];
    const aliases = new Map<string, string>();
    // Edges already claimed per target within this patch, so several sources
    // land on distinct handles (mirrors compose()'s usedTargetHandles).
    const usedTargetHandles = new Map<string, Set<string>>();

    const flow = useFlow.getState();
    const hasSteps =
        (patch.add_nodes?.length ?? 0) +
            (patch.add_edges?.length ?? 0) +
            (patch.update_nodes?.length ?? 0) +
            (patch.remove_nodes?.length ?? 0) >
        0;
    if (!hasSteps) {
        return { ok: false, error: "empty patch" };
    }

    // One history snapshot per agent turn → one Cmd+Z undoes it all.
    flow.commitHistory(`agent:${turnId}`);

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
        const resolved = resolveNodeRef(ref, useFlow.getState().nodes);
        return resolved.id
            ? useFlow.getState().nodes.find((n) => n.id === resolved.id)?.type
            : undefined;
    };
    pendingEdges = pendingEdges.filter((e) => {
        const error = edgeShapeError(refType(e.from), refType(e.to));
        if (!error) return true;
        results.push({
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
        if (!isKnownType(spec.type)) {
            results.push({
                op: "add_node",
                ref: spec.alias,
                ok: false,
                error: `unknown node type "${spec.type}"`,
                hint: `closest known types: ${closestTypes(spec.type).join(", ")}`,
            });
            continue;
        }
        const { data, error } = attachmentData(spec, attachments);
        if (error) {
            results.push({ op: "add_node", ref: spec.alias, ok: false, error });
            continue;
        }

        const nodeData: Record<string, unknown> = { ...data };
        if (spec.pluginId) nodeData.pluginId = spec.pluginId;
        if (spec.pluginModel) nodeData.pluginModel = spec.pluginModel;

        // If this node's first incoming edge originates from an
        // already-materialized node, create node+edge in one `expands` call:
        // it derives handles, lays out the child and fires camera-follow.
        const edgeIdx = pendingEdges.findIndex((e) => {
            if (e.to !== spec.alias) return false;
            const from = resolveNodeRef(
                e.from,
                useFlow.getState().nodes,
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
                useFlow.getState().nodes,
                aliases,
            );
            const before = new Set(useFlow.getState().nodes.map((n) => n.id));
            const ids = useFlow
                .getState()
                .expands(from.id ?? null, [
                    { type: spec.type, data: nodeData },
                ]);
            newId = ids[0];
            reused = newId !== undefined && before.has(newId);
            if (newId) {
                pendingEdges.splice(edgeIdx, 1);
                const targetHandle = useFlow
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
            newId = useFlow.getState().addNode({
                type: spec.type,
                data: nodeData,
            });
        }

        if (!newId) {
            results.push({
                op: "add_node",
                ref: spec.alias,
                ok: false,
                error: "node creation failed",
            });
            continue;
        }

        aliases.set(spec.alias, newId);
        results.push({
            op: "add_node",
            ref: spec.alias,
            ok: true,
            nodeId: newId,
            ...(reused ? { reused: true } : {}),
        });
        await sleep(STEP_PACING_MS);
    }

    /* ---- remaining edges (cross-links, fan-ins) --------------------- */

    for (const spec of pendingEdges) {
        const state = useFlow.getState();
        const from = resolveNodeRef(spec.from, state.nodes, aliases);
        const to = resolveNodeRef(spec.to, state.nodes, aliases);
        const refLabel = `${spec.from}→${spec.to}`;

        const missing = !from.id ? spec.from : !to.id ? spec.to : undefined;
        if (missing) {
            results.push({
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
            results.push({
                op: "add_edge",
                ref: refLabel,
                ok: false,
                error: `connection rejected (${fromNode.type} → ${toNode.type}${targetHandle ? ` on ${targetHandle}` : ""})`,
                hint: "check the catalog: the target field's modality must match the source output, and single-value inputs accept only one edge",
            });
            continue;
        }

        const edge: Edge = {
            id: v4(),
            source: fromNode.id,
            target: toNode.id,
            type: "custom-edge",
            ...(sourceHandle ? { sourceHandle } : {}),
            ...(targetHandle ? { targetHandle } : {}),
        };
        useFlow.getState().setEdges([...useFlow.getState().edges, edge]);
        if (targetHandle) {
            used.add(targetHandle);
            usedTargetHandles.set(toNode.id, used);
        }

        results.push({ op: "add_edge", ref: refLabel, ok: true });
        await sleep(STEP_PACING_MS);
    }

    /* ---- update_nodes ---------------------------------------------- */

    for (const spec of patch.update_nodes ?? []) {
        const state = useFlow.getState();
        const ref = resolveNodeRef(spec.id, state.nodes, aliases);
        if (!ref.id) {
            results.push({
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
            results.push({
                op: "update_node",
                ref: spec.id,
                ok: false,
                error: "'prompt' is derived at run time and cannot be set",
                hint: "set the node's own fields (e.g. text, duration) instead",
            });
            continue;
        }
        mergeNodeData(ref.id, spec.data);
        results.push({ op: "update_node", ref: spec.id, ok: true });
        await sleep(STEP_PACING_MS);
    }

    /* ---- remove_nodes ----------------------------------------------- */

    for (const refStr of patch.remove_nodes ?? []) {
        const state = useFlow.getState();
        const ref = resolveNodeRef(refStr, state.nodes, aliases);
        if (!ref.id) {
            results.push({
                op: "remove_node",
                ref: refStr,
                ok: false,
                error: ref.ambiguous
                    ? `reference "${refStr}" is ambiguous`
                    : `node "${refStr}" not found`,
            });
            continue;
        }
        useFlow.getState().removeNode(ref.id);
        results.push({ op: "remove_node", ref: refStr, ok: true });
        await sleep(STEP_PACING_MS);
    }

    // Tidy the components this patch touched. No separate history entry —
    // the turn-level `agent:<turnId>` snapshot already covers it, so one
    // Cmd+Z still reverts the whole agent turn including the layout.
    const touchedIds = results
        .filter((r) => r.ok && r.nodeId)
        .map((r) => r.nodeId as string);
    for (const spec of patch.update_nodes ?? []) {
        const ref = resolveNodeRef(spec.id, useFlow.getState().nodes, aliases);
        if (ref.id) touchedIds.push(ref.id);
    }
    if (touchedIds.length > 0) {
        useFlow.getState().autoLayout(touchedIds, { history: false });
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

function readCanvas(scope?: string): ToolResult {
    const { nodes, edges, selectedNodes } = useFlow.getState();
    const statusByNodeId = useTaskStore.getState().nodeExecutionStatusMap;

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

    return {
        ok: true,
        canvas: renderCanvas(nodes, edges, {
            selectedIds: selectedNodes.map((n) => n.id),
            statusByNodeId,
            maxText: 200,
            only,
        }),
    };
}

/* ------------------------------------------------------------------ */
/* validate_workflow                                                   */
/* ------------------------------------------------------------------ */

function validateWorkflow(): ToolResult {
    const { nodes, edges } = useFlow.getState();
    const registry = usePluginsRegistryStore.getState().registry;
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
        if (!feature) continue;
        const short = `#${node.id.slice(0, 8)} ${node.type}`;
        const spec = resolveSpec(
            feature,
            NODE_TYPE_SOURCE_SPEC[node.type ?? ""],
        );
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

        const installed = registry?.nodePluginMap?.[feature] ?? [];
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

    return { ok: true, valid: problems.length === 0, problems };
}

/* ------------------------------------------------------------------ */
/* describe_node_type                                                  */
/* ------------------------------------------------------------------ */

function describeNodeType(type: string): ToolResult {
    if (!isKnownType(type)) {
        return {
            ok: false,
            error: `unknown node type "${type}"`,
            hint: `closest known types: ${closestTypes(type).join(", ")}`,
        };
    }
    const feature = NODE_TYPE_TO_ABI_FEATURE[type];
    if (!feature) {
        return {
            ok: true,
            type,
            kind: "data-node",
            note: "carries assets; data keys are texts (textNode/linkNode) or fileKeys (other modalities)",
        };
    }
    const topology = getAbiTopology(feature);
    const spec = resolveSpec(feature, NODE_TYPE_SOURCE_SPEC[type]);
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
/* Workflow persistence tools                                          */
/* ------------------------------------------------------------------ */

async function toolListWorkflows(): Promise<ToolResult> {
    try {
        const res = await listWorkflows();
        return {
            ok: true,
            workflows: (res.workflows ?? []).map((w) => ({
                id: w.id,
                name: w.name,
                description: w.description ?? undefined,
            })),
        };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

async function toolLoadWorkflow(id: number): Promise<ToolResult> {
    try {
        const res = await getWorkflow(id);
        // `flow` is stored as a JSON string; the import parser tolerates both
        // encodings and the {flow:...} envelope.
        const parsed = parseWorkflowImportJson({ flow: res.workflow.flow });
        const flow = useFlow.getState();
        flow.commitHistory("agent:load-workflow");
        flow.setNodes(parsed.nodes);
        flow.setEdges(parsed.edges);
        flow.setWorkflowId(res.workflow.id);
        flow.setWorkflowName(res.workflow.name ?? "");
        flow.setWorkflowDescription(res.workflow.description ?? "");
        return {
            ok: true,
            loaded: res.workflow.name,
            nodes: parsed.nodes.length,
        };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

async function toolSaveWorkflow(args: {
    name?: string;
    description?: string;
}): Promise<ToolResult> {
    try {
        const state = useFlow.getState();
        if (state.nodes.length === 0) {
            return { ok: false, error: "canvas is empty; nothing to save" };
        }
        const name = args.name || state.workflowName || "Agent workflow";
        const description = args.description ?? state.workflowDescription;
        const executable = exportWorkflow(state.nodes, state.edges, {
            name,
            description,
            includeOriginalFlow: true,
        });
        const res = await saveWorkflow({
            workflowId: state.workflowId ?? undefined,
            name,
            description,
            flow: { nodes: state.nodes, edges: state.edges },
            executable,
        });
        if (res.workflowId !== undefined && res.workflowId !== null) {
            state.setWorkflowId(res.workflowId);
        }
        state.setWorkflowName(name);
        if (description) state.setWorkflowDescription(description);
        return { ok: true, workflowId: res.workflowId, name };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export async function executeAgentTool(
    name: string,
    args: Record<string, unknown>,
    context: { attachments: AgentAttachment[]; turnId: string },
): Promise<ToolResult> {
    try {
        switch (name) {
            case "apply_graph_patch":
                return await applyGraphPatch(
                    args as GraphPatch,
                    context.attachments,
                    context.turnId,
                );
            case "read_canvas":
                return readCanvas(
                    typeof args.scope === "string" ? args.scope : undefined,
                );
            case "validate_workflow":
                return validateWorkflow();
            case "describe_node_type":
                return describeNodeType(String(args.type ?? ""));
            case "list_workflows":
                return await toolListWorkflows();
            case "load_workflow":
                return await toolLoadWorkflow(Number(args.id));
            case "save_workflow":
                return await toolSaveWorkflow(
                    args as { name?: string; description?: string },
                );
            default:
                return { ok: false, error: `unknown tool "${name}"` };
        }
    } catch (e) {
        logger.error("[agent] tool failed:", name, e);
        return { ok: false, error: String(e) };
    }
}
