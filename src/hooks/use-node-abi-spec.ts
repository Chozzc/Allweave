/**
 * Resolved ABI spec for the node this hook is called from.
 *
 * The spec is looked up by the node's React Flow type in the static
 * `NODE_TYPE_SOURCE_SPEC` registry — the same table the exporter, connection
 * validator and agent tools read headlessly — so a component never carries its
 * own `sourceSpec`. A type missing from the table (should not happen for a
 * registered ABI node) falls back to the bare ABI topology of `feature`.
 */

import { useNodeId, useStore } from "@xyflow/react";
import { useMemo } from "react";
import type { NodeSlot, ResolvedSpec } from "tongflow";
import { resolvedSpecForNodeType, resolveSpec } from "tongflow";

/** React Flow type of the current node (undefined outside a node). */
export function useNodeType(): string | undefined {
    const nodeId = useNodeId();
    return useStore((state) => state.nodeLookup.get(nodeId ?? "")?.type);
}

export function useNodeAbiSpec<F extends NodeSlot>(feature: F): ResolvedSpec {
    const nodeType = useNodeType();
    return useMemo(
        () => resolvedSpecForNodeType(nodeType) ?? resolveSpec(feature, {}),
        [nodeType, feature],
    );
}
