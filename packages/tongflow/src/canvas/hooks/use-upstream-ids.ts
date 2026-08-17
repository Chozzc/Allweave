/**
 * Upstream node ids for display, derived from the live edge list.
 *
 * Node components must not render from the compose-time `data.ids` snapshot
 * alone: edges can be added by hand, reconnected, or rewritten via the edge
 * target-handle select, and none of those paths update `data.ids`. Deriving
 * from the subscribed edge list keeps the node's display in sync with every
 * edge mutation. The snapshot is only a fallback for nodes with no incoming
 * edges (legacy workflows persisted before edges were authoritative).
 */

import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { useMemo } from "react";

export function useUpstreamNodeIds(snapshotIds?: string[]): string[] {
    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);
    return useMemo(() => {
        const ids: string[] = [];
        if (nodeId) {
            for (const e of edges) {
                if (e.target === nodeId && !ids.includes(e.source)) {
                    ids.push(e.source);
                }
            }
        }
        return ids.length > 0 ? ids : (snapshotIds ?? []);
    }, [nodeId, edges, snapshotIds]);
}
