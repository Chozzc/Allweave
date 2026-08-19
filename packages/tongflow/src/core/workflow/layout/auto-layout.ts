/**
 * Layered auto-layout ("tidy") for the canvas.
 *
 * Hand-rolled on purpose: workflow graphs are small DAGs with a strict
 * add → data → executable → data alternation, so Kahn layering (already
 * implemented by WorkflowParser for execution planning) gives the columns,
 * a single barycenter pass orders each column, and real node sizes drive
 * the spacing. No layout library needed.
 *
 * Pure functions — the store applies the returned positions.
 */

import type { Edge, Node } from "@xyflow/react";
import { logger } from "../../logger";
import { WorkflowParser } from "../parser";
import { COMPONENT_V_GAP, estimateNodeSize, H_GAP, V_GAP } from "./node-dims";

export interface AutoLayoutOptions {
    /** Restrict layout to these node ids; all other nodes stay untouched. */
    scope?: Set<string>;
}

interface Box {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/**
 * Union of the weakly-connected components containing any of `seedIds`.
 * Used to scope a layout to just the region a change touched.
 */
export function componentsContaining(
    seedIds: Iterable<string>,
    nodes: Node[],
    edges: Edge[],
): Set<string> {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const adjacency = new Map<string, string[]>();
    const link = (from: string, to: string) => {
        const list = adjacency.get(from);
        if (list) list.push(to);
        else adjacency.set(from, [to]);
    };
    for (const e of edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        link(e.source, e.target);
        link(e.target, e.source);
    }

    const seen = new Set<string>();
    const queue: string[] = [];
    for (const id of seedIds) {
        if (nodeIds.has(id) && !seen.has(id)) {
            seen.add(id);
            queue.push(id);
        }
    }
    while (queue.length > 0) {
        const id = queue.shift() as string;
        for (const next of adjacency.get(id) ?? []) {
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen;
}

function splitComponents(nodes: Node[], edges: Edge[]): Node[][] {
    const remaining = new Set(nodes.map((n) => n.id));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const components: Node[][] = [];
    for (const node of nodes) {
        if (!remaining.has(node.id)) continue;
        const member = componentsContaining([node.id], nodes, edges);
        for (const id of member) remaining.delete(id);
        components.push([...member].map((id) => byId.get(id) as Node));
    }
    return components;
}

function bboxOf(
    nodes: Node[],
    positions: Map<string, { x: number; y: number }>,
): Box {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
        const pos = positions.get(node.id) ?? node.position;
        const { w, h } = estimateNodeSize(node);
        minX = Math.min(minX, pos.x - w / 2);
        maxX = Math.max(maxX, pos.x + w / 2);
        minY = Math.min(minY, pos.y - h / 2);
        maxY = Math.max(maxY, pos.y + h / 2);
    }
    return { minX, maxX, minY, maxY };
}

/** Layout one weakly-connected component in local coordinates. */
function layoutComponent(
    componentNodes: Node[],
    edges: Edge[],
): Map<string, { x: number; y: number }> | null {
    const ids = new Set(componentNodes.map((n) => n.id));
    const componentEdges = edges.filter(
        (e) => ids.has(e.source) && ids.has(e.target),
    );

    const parser = new WorkflowParser({
        nodes: componentNodes,
        edges: componentEdges,
    });
    const plan = parser.generateExecutionPlan();

    // Column per node from the Kahn level; cycle members come back with
    // level -1 and are left exactly where they are.
    const columns = new Map<number, Node[]>();
    let skippedCycle = false;
    for (const node of componentNodes) {
        const level = plan.nodeInfoMap.get(node.id)?.level ?? -1;
        if (level < 0) {
            skippedCycle = true;
            continue;
        }
        const col = columns.get(level);
        if (col) col.push(node);
        else columns.set(level, [node]);
    }
    if (skippedCycle) {
        logger.warn(
            "[auto-layout] cycle detected; cyclic nodes were left in place",
        );
    }
    if (columns.size === 0) return null;

    const levels = [...columns.keys()].sort((a, b) => a - b);

    // Column X centers: cumulative max widths + H_GAP, center-anchored.
    const colWidth = new Map<number, number>();
    for (const level of levels) {
        colWidth.set(
            level,
            Math.max(
                ...(columns.get(level) as Node[]).map(
                    (n) => estimateNodeSize(n).w,
                ),
            ),
        );
    }
    const colX = new Map<number, number>();
    let x = 0;
    for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const w = colWidth.get(level) as number;
        x =
            i === 0
                ? w / 2
                : x +
                  (colWidth.get(levels[i - 1]) as number) / 2 +
                  H_GAP +
                  w / 2;
        colX.set(level, x);
    }

    // Upstream adjacency for the barycenter ordering pass.
    const upstream = new Map<string, string[]>();
    for (const e of componentEdges) {
        const list = upstream.get(e.target);
        if (list) list.push(e.source);
        else upstream.set(e.target, [e.source]);
    }

    const result = new Map<string, { x: number; y: number }>();
    for (const level of levels) {
        const colNodes = columns.get(level) as Node[];

        // Order: first column keeps the current top-to-bottom order; later
        // columns follow the mean Y of their already-placed upstream nodes.
        const sortKey = (node: Node): number => {
            if (level === levels[0]) return node.position.y;
            const ups = (upstream.get(node.id) ?? [])
                .map((id) => result.get(id)?.y)
                .filter((y): y is number => y !== undefined);
            if (ups.length === 0) return node.position.y;
            return ups.reduce((s, y) => s + y, 0) / ups.length;
        };
        const ordered = [...colNodes].sort((a, b) => sortKey(a) - sortKey(b));

        // Stack with real heights, all columns sharing vertical center 0.
        const totalH =
            ordered.reduce((s, n) => s + estimateNodeSize(n).h, 0) +
            V_GAP * Math.max(0, ordered.length - 1);
        let cursor = -totalH / 2;
        for (const node of ordered) {
            const { h } = estimateNodeSize(node);
            result.set(node.id, {
                x: colX.get(level) as number,
                y: cursor + h / 2,
            });
            cursor += h + V_GAP;
        }
    }

    return result;
}

export function computeAutoLayout(
    nodes: Node[],
    edges: Edge[],
    opts: AutoLayoutOptions = {},
): Map<string, { x: number; y: number }> {
    const scoped = opts.scope
        ? nodes.filter((n) => opts.scope?.has(n.id))
        : nodes;
    if (scoped.length === 0) return new Map();

    const scopedIds = new Set(scoped.map((n) => n.id));
    const scopedEdges = edges.filter(
        (e) => scopedIds.has(e.source) && scopedIds.has(e.target),
    );

    const components = splitComponents(scoped, scopedEdges);

    // Lay out each component locally, then anchor it on its old bbox center
    // so untouched regions of the canvas keep their frame of reference.
    const moved = new Map<string, { x: number; y: number }>();
    const placedBoxes: Box[] = [];

    const orderedComponents = [...components].sort(
        (a, b) => bboxOf(a, new Map()).minY - bboxOf(b, new Map()).minY,
    );

    for (const component of orderedComponents) {
        const local = layoutComponent(component, scopedEdges);
        if (!local) continue;

        const laidOutNodes = component.filter((n) => local.has(n.id));
        const oldBox = bboxOf(laidOutNodes, new Map());
        const newBox = bboxOf(laidOutNodes, local);
        const dx =
            (oldBox.minX + oldBox.maxX) / 2 - (newBox.minX + newBox.maxX) / 2;
        let dy =
            (oldBox.minY + oldBox.maxY) / 2 - (newBox.minY + newBox.maxY) / 2;

        // De-overlap against components already placed in this pass.
        let anchored: Box = {
            minX: newBox.minX + dx,
            maxX: newBox.maxX + dx,
            minY: newBox.minY + dy,
            maxY: newBox.maxY + dy,
        };
        for (const prev of placedBoxes) {
            const intersects =
                anchored.minX < prev.maxX &&
                anchored.maxX > prev.minX &&
                anchored.minY < prev.maxY &&
                anchored.maxY > prev.minY;
            if (intersects) {
                const shift = prev.maxY - anchored.minY + COMPONENT_V_GAP;
                dy += shift;
                anchored = {
                    ...anchored,
                    minY: anchored.minY + shift,
                    maxY: anchored.maxY + shift,
                };
            }
        }
        placedBoxes.push(anchored);

        for (const [id, pos] of local) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            const node = laidOutNodes.find((n) => n.id === id) as Node;
            if (
                Math.abs(nx - node.position.x) > 0.5 ||
                Math.abs(ny - node.position.y) > 0.5
            ) {
                moved.set(id, { x: nx, y: ny });
            }
        }
    }

    return moved;
}
