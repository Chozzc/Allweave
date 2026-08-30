/**
 * React Flow state wrapper built on Zustand.
 *
 * The document model (nodes / edges / meta, graph mutations, undo/redo,
 * combo state) is the headless `createFlowSlice` from the `tongflow`
 * package; this hook layers the React Flow callbacks on top and persists the
 * canvas to the host application's storage.
 */

import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Node,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange,
    type OnSelectionChangeFunc,
} from "@xyflow/react";
import { v4 } from "uuid";
import { create } from "zustand";
import { createFlowSlice, type FlowCoreState } from "../../core";

export type { PossibleNode } from "../../core";

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

export default useFlow;
