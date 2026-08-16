/**
 * Render ReactFlow `<Handle>` components for an ABI feature.
 *
 * Inputs:  one target Handle per `kind:"handle"` field (id = `in:<field>`)
 * Outputs: one source Handle per ABI output route (id = `out:<field>`)
 *
 * Layout: all handles emit from the vertical center of the node's left
 * (targets) and right (sources) edges, regardless of how many there are.
 * Callers can override layout via `style` or a `layout` prop later if needed.
 */

import { Handle, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { NodeSlot, ResolvedSpec } from "tongflow";
import { sourceHandleId, targetHandleId } from "tongflow";
import { useNodeAbiSpec } from "@/hooks/use-node-abi-spec";

export interface AbiHandlesProps<F extends NodeSlot> {
    feature: F;
    /** Override the standard left/right positioning. */
    targetPosition?: Position;
    sourcePosition?: Position;
    /** Add a CSS class to all rendered handles. */
    handleClassName?: string;
}

interface HandleSpec {
    id: string;
    role: "target" | "source";
    /** Vertical offset (0..1) along the side. */
    offset: number;
}

function distributeHandles(targets: string[], sources: string[]): HandleSpec[] {
    const out: HandleSpec[] = [];
    // All handles emit from the vertical center of their side, regardless of
    // count. Note: multiple handles on the same side overlap at 50%.
    targets.forEach((id) => out.push({ id, role: "target", offset: 0.5 }));
    sources.forEach((id) => out.push({ id, role: "source", offset: 0.5 }));
    return out;
}

function getHandleIds(spec: ResolvedSpec): {
    targets: string[];
    sources: string[];
} {
    const { topology } = spec;
    const targets: string[] = [];
    for (const field of topology.inputOrder) {
        const f = spec.fields[field];
        if (f?.kind === "handle") {
            targets.push(targetHandleId(field));
        }
    }
    const sources = topology.outputs.map((o) => sourceHandleId(o.field));
    return { targets, sources };
}

export function AbiHandles<F extends NodeSlot>({
    feature,
    targetPosition = Position.Left,
    sourcePosition = Position.Right,
    handleClassName,
}: AbiHandlesProps<F>) {
    const spec = useNodeAbiSpec(feature);
    const handles = useMemo(() => {
        const { targets, sources } = getHandleIds(spec);
        return distributeHandles(targets, sources);
    }, [spec]);

    return (
        <>
            {handles.map((h) => (
                <Handle
                    key={`${h.role}:${h.id}`}
                    type={h.role}
                    position={
                        h.role === "target" ? targetPosition : sourcePosition
                    }
                    id={h.id}
                    className={handleClassName}
                    style={{ top: `${(h.offset * 100).toFixed(2)}%` }}
                />
            ))}
        </>
    );
}
