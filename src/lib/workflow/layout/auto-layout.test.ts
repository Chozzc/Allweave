import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { componentsContaining, computeAutoLayout } from "./auto-layout";
import { estimateNodeSize, H_GAP, V_GAP } from "./node-dims";

const node = (
    id: string,
    type: string,
    x = 0,
    y = 0,
    measured?: { width: number; height: number },
): Node =>
    ({
        id,
        type,
        position: { x, y },
        data: {},
        ...(measured ? { measured } : {}),
    }) as Node;

const edge = (source: string, target: string): Edge =>
    ({ id: `${source}->${target}`, source, target }) as Edge;

function applyLayout(
    nodes: Node[],
    moved: Map<string, { x: number; y: number }>,
): Node[] {
    return nodes.map((n) =>
        moved.has(n.id) ? ({ ...n, position: moved.get(n.id) } as Node) : n,
    );
}

function overlaps(a: Node, b: Node): boolean {
    const sa = estimateNodeSize(a);
    const sb = estimateNodeSize(b);
    return (
        Math.abs(a.position.x - b.position.x) < (sa.w + sb.w) / 2 &&
        Math.abs(a.position.y - b.position.y) < (sa.h + sb.h) / 2
    );
}

describe("computeAutoLayout", () => {
    it("lays a linear chain into columns with exact edge gaps", () => {
        // Deliberately messy input positions.
        const nodes = [
            node("a", "addTextNode", 500, 300),
            node("t", "textNode", 480, 320),
            node("g", "textGenImageNode", 470, 330),
            node("i", "imageNode", 460, 340),
        ];
        const edges = [edge("a", "t"), edge("t", "g"), edge("g", "i")];

        const moved = computeAutoLayout(nodes, edges);
        const laid = applyLayout(nodes, moved);
        const byId = new Map(laid.map((n) => [n.id, n]));

        const order = ["a", "t", "g", "i"];
        for (let i = 1; i < order.length; i++) {
            const prev = byId.get(order[i - 1]) as Node;
            const curr = byId.get(order[i]) as Node;
            const gap =
                curr.position.x -
                estimateNodeSize(curr).w / 2 -
                (prev.position.x + estimateNodeSize(prev).w / 2);
            expect(gap).toBeCloseTo(H_GAP, 1);
        }

        for (let i = 0; i < laid.length; i++) {
            for (let j = i + 1; j < laid.length; j++) {
                expect(overlaps(laid[i], laid[j])).toBe(false);
            }
        }
    });

    it("fans out mixed-height children with V_GAP spacing", () => {
        const nodes = [
            node("p", "textGenImageNode", 0, 0),
            node("c1", "textNode", 0, 0, { width: 256, height: 96 }),
            node("c2", "imageNode", 0, 0, { width: 256, height: 304 }),
            node("c3", "imageFusionNode", 0, 0, { width: 480, height: 780 }),
        ];
        const edges = [edge("p", "c1"), edge("p", "c2"), edge("p", "c3")];

        const moved = computeAutoLayout(nodes, edges);
        const laid = applyLayout(nodes, moved);
        const children = laid
            .filter((n) => n.id !== "p")
            .sort((a, b) => a.position.y - b.position.y);

        for (let i = 1; i < children.length; i++) {
            const prev = children[i - 1];
            const curr = children[i];
            const gap =
                curr.position.y -
                estimateNodeSize(curr).h / 2 -
                (prev.position.y + estimateNodeSize(prev).h / 2);
            expect(gap).toBeCloseTo(V_GAP, 1);
        }
    });

    it("uncrosses edges via the barycenter pass", () => {
        // One component; the third column starts out in crossed Y order.
        const nodes = [
            node("p", "addTextNode", -400, 200),
            node("s1", "textNode", 0, 0),
            node("s2", "textNode", 0, 400),
            node("d1", "textGenImageNode", 300, 400), // fed by s1 but drawn low
            node("d2", "textGenImageNode", 300, 0), // fed by s2 but drawn high
        ];
        const edges = [
            edge("p", "s1"),
            edge("p", "s2"),
            edge("s1", "d1"),
            edge("s2", "d2"),
        ];

        const moved = computeAutoLayout(nodes, edges);
        const laid = new Map(applyLayout(nodes, moved).map((n) => [n.id, n]));
        // d1 follows s1 (top), d2 follows s2 (bottom) — no crossing.
        expect((laid.get("d1") as Node).position.y).toBeLessThan(
            (laid.get("d2") as Node).position.y,
        );
    });

    it("keeps disconnected components anchored and non-overlapping", () => {
        const compA = [
            node("a1", "textNode", 0, 0),
            node("a2", "textGenImageNode", 300, 0),
        ];
        const compB = [
            node("b1", "textNode", 20, 800),
            node("b2", "textGenImageNode", 320, 800),
        ];
        const nodes = [...compA, ...compB];
        const edges = [edge("a1", "a2"), edge("b1", "b2")];

        const moved = computeAutoLayout(nodes, edges);
        const laid = applyLayout(nodes, moved);

        const center = (ids: string[]) => {
            const subset = laid.filter((n) => ids.includes(n.id));
            return subset.reduce((s, n) => s + n.position.y, 0) / subset.length;
        };
        // Components stay in their own regions (A up top, B down below).
        expect(center(["a1", "a2"])).toBeLessThan(center(["b1", "b2"]));

        for (const a of laid.filter((n) => n.id.startsWith("a"))) {
            for (const b of laid.filter((n) => n.id.startsWith("b"))) {
                expect(overlaps(a, b)).toBe(false);
            }
        }
    });

    it("skips cycle members", () => {
        const nodes = [
            node("x", "textGenImageNode", 0, 0),
            node("y", "imageGenVideoNode", 300, 0),
        ];
        const edges = [edge("x", "y"), edge("y", "x")];
        const moved = computeAutoLayout(nodes, edges);
        expect(moved.size).toBe(0);
    });

    it("never moves nodes outside the scope", () => {
        const nodes = [
            node("in1", "textNode", 0, 0),
            node("in2", "textGenImageNode", 10, 10),
            node("out", "textNode", 5000, 5000),
        ];
        const edges = [edge("in1", "in2")];
        const moved = computeAutoLayout(nodes, edges, {
            scope: new Set(["in1", "in2"]),
        });
        expect(moved.has("out")).toBe(false);
    });

    it("is idempotent", () => {
        const nodes = [
            node("a", "textNode", 123, 456),
            node("b", "textGenImageNode", 0, 0),
            node("c", "imageNode", 900, 100),
        ];
        const edges = [edge("a", "b"), edge("b", "c")];

        const first = computeAutoLayout(nodes, edges);
        const after = applyLayout(nodes, first);
        const second = computeAutoLayout(after, edges);
        expect(second.size).toBe(0);
    });

    it("handles the bundled example workflow without overlaps", () => {
        const raw = JSON.parse(
            readFileSync(join(process.cwd(), "public/example.json"), "utf-8"),
        ) as {
            originalFlow: { nodes: Node[]; edges: Edge[] };
        };
        const { nodes, edges } = raw.originalFlow;

        const moved = computeAutoLayout(nodes, edges);
        const laid = applyLayout(nodes, moved);
        for (let i = 0; i < laid.length; i++) {
            for (let j = i + 1; j < laid.length; j++) {
                expect(overlaps(laid[i], laid[j])).toBe(false);
            }
        }
    });
});

describe("componentsContaining", () => {
    it("returns the full weak component from a single seed", () => {
        const nodes = [
            node("a", "textNode"),
            node("b", "textGenImageNode"),
            node("c", "imageNode"),
            node("z", "textNode"),
        ];
        const edges = [edge("a", "b"), edge("b", "c")];
        const set = componentsContaining(["c"], nodes, edges);
        expect([...set].sort()).toEqual(["a", "b", "c"]);
    });
});
