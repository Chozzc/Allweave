/**
 * React Flow state wrapper built on Zustand.
 * Tracks node/edge lists and persisted workflow meta.
 */

import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Edge,
    type Node,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange,
    type OnSelectionChangeFunc,
} from "@xyflow/react";
import { v4 } from "uuid";
import { create } from "zustand";
import {
    resolvedSpecForNodeType,
    resolveEdgeHandles,
} from "@/lib/abi/node-feature-registry";
import { DATA_NODE_TYPES } from "@/lib/workflow/executable-workflow";
import {
    currentFocusGeneration,
    type FlowSnapshot,
    pushSnapshot,
    snapshotFlow,
} from "@/lib/workflow/flow-history";
import {
    componentsContaining,
    computeAutoLayout,
} from "@/lib/workflow/layout/auto-layout";
import {
    estimateNodeSize,
    H_GAP,
    V_GAP,
} from "@/lib/workflow/layout/node-dims";

// True when React Flow reports a persisted data/input node type
function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

// Simple debouncer factory
function createDebounce<T extends unknown[]>(
    callback: (...args: T) => void,
    delay: number,
) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: T) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            callback(...args);
            timeoutId = null;
        }, delay);
    };
}

// Persist React Flow nodes to localStorage with debouncing
const debouncedSaveNodes = createDebounce((nodes: Node[]) => {
    localStorage.setItem("nodes", JSON.stringify(nodes));
}, 500);

// Persist edges similarly
const debouncedSaveEdges = createDebounce((edges: Edge[]) => {
    localStorage.setItem("edges", JSON.stringify(edges));
}, 500);

// Coalescing tracker for history commits: repeated commits with the same
// source are skipped while the focused element stays the same, so a typing
// burst in one form field becomes a single undo entry.
const lastCommit = { source: "", focusGen: -1 };

function resetCommitTracker() {
    lastCommit.source = "";
    lastCommit.focusGen = -1;
}

// Settle watcher: after an auto-layout, media nodes may still re-measure
// asynchronously (image/video loads change their width). For a short window
// we re-run the same scoped layout on dimension changes so the tidy result
// doesn't go stale — but any user drag cancels the watch immediately so a
// layout can never fight a manual arrangement.
const LAYOUT_SETTLE_WINDOW_MS = 1500;
const layoutSettleWatch: { scope: Set<string> | null; until: number } = {
    scope: null,
    until: 0,
};
const cancelLayoutSettleWatch = () => {
    layoutSettleWatch.scope = null;
    layoutSettleWatch.until = 0;
};
const debouncedSettleRelayout = createDebounce((run: () => void) => run(), 300);

// Persist workflow meta (title, ids, notes)
const debouncedSaveWorkflowMeta = createDebounce(
    (meta: { id: number | null; name: string; description: string }) => {
        localStorage.setItem("workflowMeta", JSON.stringify(meta));
    },
    500,
);

export interface PossibleNode {
    type: string;
    data?: Record<string, unknown>;
}

export interface FlowState {
    currFlow: { nodes: Node[]; edges: Edge[] };
    nodes: Node[];
    edges: Edge[];
    workflowName: string;
    workflowId: number | null;
    workflowDescription: string;

    selectedNodes: Node[];
    comboMode: boolean;
    comboSelectedIds: Set<string>;

    // Combo / selection helpers
    setComboMode: (enabled: boolean) => void;
    isInCombo: (id: string) => boolean;
    toggleCombo: (id: string) => void;
    clearCombo: () => void;
    setWorkflowName: (name: string) => void;
    setWorkflowId: (id: number | null) => void;
    setWorkflowDescription: (description: string) => void;

    computeMap: Map<string, () => void>;
    registerCompute: (id: string, fn: () => void) => void;
    getCompute: (id: string) => (() => void) | undefined;
    onSelectionChange: OnSelectionChangeFunc;
    onNodesChange: OnNodesChange<Node>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    /** Id of the edge currently being reconnected (excluded from validation). */
    reconnectingEdgeId: string | null;
    setReconnectingEdgeId: (id: string | null) => void;
    expands: (nodeId: string | null, possibleNodes: PossibleNode[]) => string[];
    compose: (newNode: { type: string; data: unknown }) => string;
    updates: (
        nodeId: string,
        data: Record<string, unknown>,
        opts?: { history?: boolean },
    ) => void;

    /**
     * Tidy the canvas (or just the weakly-connected components containing
     * `seedIds`) into a layered layout. Returns true when anything moved.
     * `history: false` folds the move into the caller's own snapshot.
     */
    autoLayout: (seedIds?: string[], opts?: { history?: boolean }) => boolean;

    // Undo/redo history (snapshots of { nodes, edges })
    historyPast: FlowSnapshot[];
    historyFuture: FlowSnapshot[];
    /**
     * Snapshot the current state onto the past stack and clear the future
     * stack. Commits with the same `source` coalesce while focus stays put.
     */
    commitHistory: (source?: string) => void;
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;
    addNode: (
        node: PossibleNode,
        position?: { x: number; y: number },
    ) => string;
    removeNode: (nodeId: string) => void;
    // Node-created listeners
    nodeCreatedCallbacks: Set<(nodeIds: string[]) => void>;
    onNodeCreated: (callback: (nodeIds: string[]) => void) => () => void;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export const useFlow = create<FlowState>((set, get) => ({
    currFlow: { nodes: [], edges: [] },
    nodes: initialNodes,
    edges: initialEdges,
    workflowName: "",
    workflowId: null,
    workflowDescription: "",
    // Multi-select compose mode tracking
    comboMode: false,
    comboSelectedIds: new Set<string>(),
    reconnectingEdgeId: null,

    autoLayout: (seedIds, opts) => {
        const { nodes, edges } = get();
        const scope =
            seedIds && seedIds.length > 0
                ? componentsContaining(seedIds, nodes, edges)
                : undefined;
        const moved = computeAutoLayout(nodes, edges, { scope });
        if (moved.size === 0) return false;

        if (opts?.history !== false) {
            get().commitHistory("layout");
            // Break coalescing so the next tidy gets its own undo entry
            // (same pattern as the remove path).
            queueMicrotask(resetCommitTracker);
        }

        const newNodes = get().nodes.map((n) => {
            const pos = moved.get(n.id);
            return pos ? { ...n, position: pos } : n;
        });
        set({ nodes: newNodes });
        debouncedSaveNodes(newNodes);

        // Watch for late media re-measures within this scope and re-tidy
        // without a new history entry; user drags cancel the watch.
        layoutSettleWatch.scope = scope ?? new Set(newNodes.map((n) => n.id));
        layoutSettleWatch.until = Date.now() + LAYOUT_SETTLE_WINDOW_MS;
        return true;
    },

    historyPast: [],
    historyFuture: [],
    commitHistory: (source) => {
        const focusGen = currentFocusGeneration();
        if (
            source &&
            source === lastCommit.source &&
            focusGen === lastCommit.focusGen
        ) {
            // Same source within the same focus session — coalesce
            return;
        }
        lastCommit.source = source ?? "";
        lastCommit.focusGen = focusGen;
        const { nodes, edges, historyPast } = get();
        set({
            historyPast: pushSnapshot(historyPast, snapshotFlow(nodes, edges)),
            historyFuture: [],
        });
    },
    undo: () => {
        const { historyPast, historyFuture, nodes, edges } = get();
        const previous = historyPast[historyPast.length - 1];
        if (!previous) return;
        resetCommitTracker();
        set({
            nodes: previous.nodes,
            edges: previous.edges,
            historyPast: historyPast.slice(0, -1),
            historyFuture: historyFuture.concat(snapshotFlow(nodes, edges)),
            selectedNodes: [],
            comboMode: false,
            comboSelectedIds: new Set(),
        });
        debouncedSaveNodes(previous.nodes);
        debouncedSaveEdges(previous.edges);
    },
    redo: () => {
        const { historyPast, historyFuture, nodes, edges } = get();
        const next = historyFuture[historyFuture.length - 1];
        if (!next) return;
        resetCommitTracker();
        set({
            nodes: next.nodes,
            edges: next.edges,
            historyPast: pushSnapshot(historyPast, snapshotFlow(nodes, edges)),
            historyFuture: historyFuture.slice(0, -1),
            selectedNodes: [],
            comboMode: false,
            comboSelectedIds: new Set(),
        });
        debouncedSaveNodes(next.nodes);
        debouncedSaveEdges(next.edges);
    },
    clearHistory: () => {
        resetCommitTracker();
        set({ historyPast: [], historyFuture: [] });
    },

    nodeCreatedCallbacks: new Set(),
    onNodeCreated: (callback) => {
        const callbacks = get().nodeCreatedCallbacks;
        callbacks.add(callback);
        // Caller receives an unsubscribe closure
        return () => {
            callbacks.delete(callback);
        };
    },

    computeMap: new Map(),
    registerCompute: (id, fn) => {
        const map = new Map(get().computeMap);
        map.set(id, fn);
        set({ computeMap: map });
    },
    getCompute: (id) => get().computeMap.get(id),
    selectedNodes: [],
    onSelectionChange: ({ nodes }) => {
        set({
            selectedNodes: nodes,
        });
    },
    onNodesChange: (changes) => {
        // Only removals commit history here; position changes stream per-frame
        // during drags and are captured once via onNodeDragStart instead.
        // React Flow's keyboard delete emits edge and node removals as two
        // synchronous callbacks — the shared "remove" source coalesces them
        // into one entry, and the microtask reset keeps the next delete fresh.
        if (changes.some((c) => c.type === "remove")) {
            get().commitHistory("remove");
            queueMicrotask(resetCommitTracker);
        }

        // Settle watcher: a user drag cancels any pending re-tidy; a late
        // dimension change inside a just-tidied scope re-runs that layout
        // (no extra history — it folds into the original layout snapshot).
        if (layoutSettleWatch.scope) {
            if (
                changes.some(
                    (c) => c.type === "position" && c.dragging === true,
                )
            ) {
                cancelLayoutSettleWatch();
            } else if (Date.now() < layoutSettleWatch.until) {
                const watched = layoutSettleWatch.scope;
                if (
                    changes.some(
                        (c) => c.type === "dimensions" && watched.has(c.id),
                    )
                ) {
                    debouncedSettleRelayout(() => {
                        if (
                            layoutSettleWatch.scope === watched &&
                            Date.now() <
                                layoutSettleWatch.until +
                                    LAYOUT_SETTLE_WINDOW_MS
                        ) {
                            get().autoLayout([...watched], {
                                history: false,
                            });
                        }
                    });
                }
            } else {
                cancelLayoutSettleWatch();
            }
        }

        const nodes = applyNodeChanges(changes, get().nodes);
        let edges = get().edges;
        const removedIds: string[] = [];
        for (const c of changes) {
            if (c.type === "remove") {
                removedIds.push(c.id);
            }
        }
        if (removedIds.length > 0) {
            const idSet = new Set(removedIds);
            edges = edges.filter(
                (e) => !idSet.has(e.source) && !idSet.has(e.target),
            );
        }
        set({
            nodes,
            edges,
        });
        debouncedSaveNodes(nodes);
        debouncedSaveEdges(edges);
    },
    onEdgesChange: (changes) => {
        if (changes.some((c) => c.type === "remove")) {
            get().commitHistory("remove");
            queueMicrotask(resetCommitTracker);
        }
        const edges = applyEdgeChanges(changes, get().edges);
        set({
            edges: edges,
        });
        debouncedSaveEdges(edges);
    },
    onConnect: (connection) => {
        get().commitHistory();
        const edges = addEdge(
            { ...connection, type: "custom-edge" },
            get().edges,
        );
        set({
            edges: edges,
        });
        debouncedSaveEdges(edges);
    },
    setNodes: (nodes) => {
        set({ nodes });
        debouncedSaveNodes(nodes);
    },
    setEdges: (edges) => {
        set({ edges });
        debouncedSaveEdges(edges);
    },
    setReconnectingEdgeId: (id) => set({ reconnectingEdgeId: id }),
    updates: (nodeId, data, opts) => {
        if (opts?.history !== false) {
            get().commitHistory(`update:${nodeId}`);
        }
        const newNodes = get().nodes.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data,
                };
            }
            return node;
        });
        set({
            nodes: newNodes,
        });
        debouncedSaveNodes(newNodes);
    },
    addNode: (node: PossibleNode, position?: { x: number; y: number }) => {
        get().commitHistory();
        const { nodes } = get();

        let defaultX = 100;
        let defaultY = 100;

        if (position) {
            defaultX = position.x;
            defaultY = position.y;
        } else if (nodes.length > 0) {
            // Spawn to the far right when the canvas already has nodes.
            // position.x is the node CENTER (origin [0.5, 0.5]), so the
            // right edge is x + width/2; the gap accounts for both widths.
            const rightEdge = (n: Node) =>
                n.position.x + estimateNodeSize(n).w / 2;
            const rightmostNode = nodes.reduce((rightmost, current) =>
                rightEdge(current) > rightEdge(rightmost) ? current : rightmost,
            );

            defaultX =
                rightEdge(rightmostNode) +
                H_GAP +
                estimateNodeSize({ type: node.type }).w / 2;
            defaultY = rightmostNode.position.y;
        }

        const nodeId = v4();
        const newNode = {
            id: nodeId,
            type: node.type,
            position: {
                x: defaultX,
                y: defaultY,
            },
            origin: [0.5, 0.5] as [number, number],
            data: node?.data ?? {},
        };
        const newNodes = nodes.concat(newNode);
        set({ nodes: newNodes });
        debouncedSaveNodes(newNodes);
        // Notify canvas listeners that a node was inserted
        get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
        return nodeId;
    },
    removeNode: (nodeId: string) => {
        get().commitHistory();
        const { nodes, edges } = get();
        const newNodes = nodes.filter((node) => node.id !== nodeId);
        const newEdges = edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
        );
        set({
            nodes: newNodes,
            edges: newEdges,
        });
        localStorage.setItem("nodes", JSON.stringify(newNodes));
        localStorage.setItem("edges", JSON.stringify(newEdges));
    },

    expands: (nodeId, possibleNodes): string[] => {
        const { nodes } = get();
        let { edges } = get();
        const currNode = nodes.find((node) => node.id === nodeId);
        if (!currNode) {
            return [];
        }
        get().commitHistory();

        // Track whether upstream node emits persistent artifacts
        const sourceIsDataNode = isDataNode(currNode.type ?? "");

        // Locate existing downstream nodes via outgoing edges
        const existingChildEdges = edges.filter(
            (edge) => edge.source === currNode.id,
        );
        const existingChildNodes = existingChildEdges
            .map((edge) => nodes.find((n) => n.id === edge.target))
            .filter(Boolean) as Node[];

        // Bucket existing downstream siblings by Flow type. Multiple same-type
        // siblings are kept in edge order so caller can request N-of-same-type
        // expansion (e.g. ABI `x-expand-each` arrays) and we reuse the first N
        // in order, spawning more only when the new batch is larger.
        const existingChildrenByType = new Map<string, Node[]>();
        if (!sourceIsDataNode) {
            for (const child of existingChildNodes) {
                if (!child.type) continue;
                const bucket = existingChildrenByType.get(child.type);
                if (bucket) bucket.push(child);
                else existingChildrenByType.set(child.type, [child]);
            }
        }
        // Cursor per type tracking how many same-type siblings we've consumed.
        const reuseCursorByType = new Map<string, number>();

        const { position } = currNode;
        const ids: string[] = [];
        const newNodes: Node[] = [];
        const newlyCreatedIds: string[] = [];
        let updatedNodes = [...nodes];

        // Count how many will be freshly created so vertical layout centers
        // only the new ones around the parent (existing ones keep position).
        const nodesToCreate = possibleNodes.filter(({ type }) => {
            const available = existingChildrenByType.get(type)?.length ?? 0;
            const cursor = reuseCursorByType.get(type) ?? 0;
            if (cursor < available) {
                reuseCursorByType.set(type, cursor + 1);
                return false;
            }
            return true;
        });
        // Reset cursors for the real loop below — the filter pass above only
        // consumed them to compute how many fresh nodes we'll spawn.
        reuseCursorByType.clear();

        // All nodes are center-anchored (origin [0.5, 0.5]): a constant
        // edge-to-edge gap needs both the parent's and each child's width.
        const parentHalfW = estimateNodeSize(currNode).w / 2;
        const freshSizes = nodesToCreate.map((n) => estimateNodeSize(n));
        const totalH =
            freshSizes.reduce((sum, s) => sum + s.h, 0) +
            V_GAP * Math.max(0, freshSizes.length - 1);

        // Vertical cursor: stack fresh children below the lowest existing
        // child (repeated expands on one parent must not pile up on the same
        // point), otherwise center the stack on the parent.
        let yCursor: number;
        if (existingChildNodes.length > 0) {
            const lowestBottom = Math.max(
                ...existingChildNodes.map(
                    (child) => child.position.y + estimateNodeSize(child).h / 2,
                ),
            );
            yCursor = lowestBottom + V_GAP;
        } else {
            yCursor = position.y - totalH / 2;
        }

        let newNodeIndex = 0;
        for (const { type, data = {} } of possibleNodes) {
            const bucket = existingChildrenByType.get(type);
            const cursor = reuseCursorByType.get(type) ?? 0;
            const existingChild =
                bucket && cursor < bucket.length ? bucket[cursor] : undefined;
            if (existingChild) reuseCursorByType.set(type, cursor + 1);

            if (existingChild) {
                // Reuse sibling data node shell; merge payloads
                ids.push(existingChild.id);
                updatedNodes = updatedNodes.map((node) => {
                    if (node.id === existingChild.id) {
                        return {
                            ...node,
                            data: { ...node.data, ...data },
                        };
                    }
                    return node;
                });
            } else {
                // Instantiate a fresh downstream node plus edge bridge
                const newNodeId = v4();
                ids.push(newNodeId);
                newlyCreatedIds.push(newNodeId);
                const edgeId = v4();

                const size = freshSizes[newNodeIndex];
                newNodes.push({
                    id: newNodeId,
                    type: type,
                    position: {
                        x: position.x + parentHalfW + H_GAP + size.w / 2,
                        y: yCursor + size.h / 2,
                    },
                    origin: [0.5, 0.5],
                    data,
                });
                yCursor += size.h + V_GAP;

                const { sourceHandle, targetHandle } = resolveEdgeHandles({
                    sourceType: currNode.type,
                    targetType: type,
                    targetSpec: resolvedSpecForNodeType(type),
                });

                edges = addEdge(
                    {
                        id: edgeId,
                        source: `${currNode.id}`,
                        target: newNodeId,
                        type: "custom-edge",
                        ...(sourceHandle ? { sourceHandle } : {}),
                        ...(targetHandle ? { targetHandle } : {}),
                    },
                    edges,
                );

                newNodeIndex++;
            }
        }

        const allNodes = updatedNodes.concat(newNodes);
        set({
            nodes: allNodes,
            edges: [...edges],
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(edges);
        // Announce only the brand-new node ids
        if (newlyCreatedIds.length > 0) {
            get().nodeCreatedCallbacks.forEach((cb) => cb(newlyCreatedIds));
        }
        return ids;
    },
    compose: ({ type, data }: { type: string; data: unknown }) => {
        get().commitHistory();
        const { comboSelectedIds, nodes, edges } = get();
        const nodeId = v4();

        // Bounding volume of the multi-select set
        const positions = Array.from(comboSelectedIds)
            .map((id) => {
                const node = nodes.find((n) => n.id === id);
                if (!node) return null;
                const size = estimateNodeSize(node);
                return {
                    x: node.position.x,
                    y: node.position.y,
                    width: size.w,
                    height: size.h,
                };
            })
            .filter(
                (
                    pos,
                ): pos is {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                } => pos !== null,
            );

        // Right edge uses center.x + half width (origin [0.5, 0.5])
        const rightmostX = Math.max(
            ...positions.map((pos) => pos.x + pos.width / 2),
        );

        // Stack selection around the shared vertical midpoint
        const minY = Math.min(
            ...positions.map((pos) => pos.y - pos.height / 2),
        );
        const maxY = Math.max(
            ...positions.map((pos) => pos.y + pos.height / 2),
        );
        const centerY = (minY + maxY) / 2;

        // Place composed node to the right, vertically centered on selection;
        // account for the new node's own width (center-anchored).
        const newNode: Node = {
            id: nodeId,
            type: type,
            position: {
                x: rightmostX + H_GAP + estimateNodeSize({ type }).w / 2,
                y: centerY, // Already node-center coordinates
            },
            origin: [0.5, 0.5],
            data: (data ?? {}) as Record<string, unknown>,
        };

        // Track target handles already chosen on this new node so multi-source
        // combos (e.g. video + image) wire to distinct handle fields instead of
        // all stacking on the same handle.
        const usedTargetHandles = new Set<string>();
        const newEdges: Edge[] = Array.from(comboSelectedIds)
            .map((id) => {
                const node = nodes.find((n) => n.id === id);
                if (!node) return null;
                const { sourceHandle, targetHandle } = resolveEdgeHandles({
                    sourceType: node.type,
                    targetType: type,
                    usedTargetHandles,
                    targetSpec: resolvedSpecForNodeType(type),
                });
                if (targetHandle) usedTargetHandles.add(targetHandle);
                return {
                    id: v4(),
                    source: `${node.id}`,
                    target: nodeId,
                    type: "custom-edge",
                    ...(sourceHandle ? { sourceHandle } : {}),
                    ...(targetHandle ? { targetHandle } : {}),
                };
            })
            .filter(Boolean) as Edge[];

        const allEdges = edges.concat(newEdges);
        const allNodes = nodes.concat([newNode]);

        set({
            nodes: allNodes,
            edges: allEdges,
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(allEdges);
        get().clearCombo();
        // Same notification path as addNode
        get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
        return nodeId;
    },

    setComboMode: (enabled) => {
        if (!enabled) {
            set({ comboMode: false, comboSelectedIds: new Set() }); // Fresh Set bumps referential equality
        } else {
            set({ comboMode: true }); // Preserve combo selection refs
        }
    },

    isInCombo: (id) => get().comboSelectedIds.has(id),

    toggleCombo: (id) => {
        const { comboSelectedIds } = get();
        const next = new Set(comboSelectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        set({
            comboSelectedIds: next,
            comboMode: next.size > 0, // Auto toggle combo UX
        });
    },

    clearCombo: () => set({ comboMode: false, comboSelectedIds: new Set() }),

    setWorkflowName: (name) => {
        set({ workflowName: name });
        const state = get();
        // Unsaved canvases omit cached titles so localized defaults survive language toggles
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowId ? name : "",
            description: state.workflowDescription,
        });
    },

    setWorkflowId: (id) => {
        set({ workflowId: id });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: id,
            name: state.workflowName,
            description: state.workflowDescription,
        });
    },

    setWorkflowDescription: (description) => {
        set({ workflowDescription: description });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowName,
            description: description,
        });
    },
}));

export default useFlow;
