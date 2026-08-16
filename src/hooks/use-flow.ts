/**
 * React Flow state wrapper built on Zustand.
 *
 * The document model (nodes / edges / meta, graph mutations, undo/redo,
 * combo state) is the headless `createFlowSlice` from the `tongflow`
 * package; this hook layers the React Flow callbacks on top and persists the
 * canvas to localStorage.
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
import { createFlowSlice, type FlowCoreState } from "tongflow";
import { v4 } from "uuid";
import { create } from "zustand";

export type { PossibleNode } from "tongflow";

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

// Persist workflow meta (title, ids, notes)
const debouncedSaveWorkflowMeta = createDebounce(
    (meta: { id: number | null; name: string; description: string }) => {
        localStorage.setItem("workflowMeta", JSON.stringify(meta));
    },
    500,
);

/** React Flow bindings layered on the headless core. */
export interface FlowReactBindings {
    onSelectionChange: OnSelectionChangeFunc;
    onNodesChange: OnNodesChange<Node>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
}

export type FlowState = FlowCoreState & FlowReactBindings;

export const useFlow = create<FlowState>()((set, get) => ({
    ...createFlowSlice(set, get, { createId: v4 }),

    onSelectionChange: ({ nodes }) => {
        get().setSelectedNodes(nodes);
    },
    onNodesChange: (changes) => {
        // Only removals commit history here; position changes stream per-frame
        // during drags and are captured once via onNodeDragStart instead.
        // React Flow's keyboard delete emits edge and node removals as two
        // synchronous callbacks — the shared "remove" source coalesces them
        // into one entry, and the microtask reset keeps the next delete fresh.
        if (changes.some((c) => c.type === "remove")) {
            get().commitHistory("remove");
            queueMicrotask(get().resetHistoryCoalescing);
        }

        // Layout settle watcher: a user drag cancels any pending re-tidy; a
        // late dimension change may re-run the just-applied layout.
        if (changes.some((c) => c.type === "position" && c.dragging === true)) {
            get().cancelLayoutSettleWatch();
        } else {
            const measured = changes
                .filter((c) => c.type === "dimensions")
                .map((c) => c.id);
            if (measured.length > 0) get().notifyNodesMeasured(measured);
        }

        const nodes = applyNodeChanges(changes, get().nodes);
        const removed = new Set(
            changes.filter((c) => c.type === "remove").map((c) => c.id),
        );
        const edges =
            removed.size > 0
                ? get().edges.filter(
                      (e) => !removed.has(e.source) && !removed.has(e.target),
                  )
                : get().edges;
        set({ nodes, edges });
    },
    onEdgesChange: (changes) => {
        if (changes.some((c) => c.type === "remove")) {
            get().commitHistory("remove");
            queueMicrotask(get().resetHistoryCoalescing);
        }
        set({ edges: applyEdgeChanges(changes, get().edges) });
    },
    onConnect: (connection) => {
        get().commitHistory();
        set({
            edges: addEdge(
                { ...connection, id: v4(), type: "custom-edge" },
                get().edges,
            ),
        });
    },
}));

// Persistence: mirror the document into localStorage (debounced) whenever the
// relevant slice of state changes.
useFlow.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes) debouncedSaveNodes(state.nodes);
    if (state.edges !== prev.edges) debouncedSaveEdges(state.edges);
    if (
        state.workflowId !== prev.workflowId ||
        state.workflowName !== prev.workflowName ||
        state.workflowDescription !== prev.workflowDescription
    ) {
        // Unsaved canvases omit cached titles so localized defaults survive
        // language toggles.
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowId ? state.workflowName : "",
            description: state.workflowDescription,
        });
    }
});

export default useFlow;
