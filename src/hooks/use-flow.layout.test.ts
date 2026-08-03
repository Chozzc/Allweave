/**
 * Spawn-math and autoLayout behavior at the store level. These pin the
 * layout invariants the canvas relies on: constant edge-to-edge gaps
 * (center-anchored nodes), no same-point stacking on repeated expands,
 * and undo semantics of the tidy action.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
});

import useFlow from "@/hooks/use-flow";
import {
    estimateNodeSize,
    H_GAP,
    V_GAP,
} from "@/lib/workflow/layout/node-dims";

function reset() {
    useFlow.setState({
        nodes: [],
        edges: [],
        historyPast: [],
        historyFuture: [],
    });
}

const nodeById = (id: string) =>
    useFlow.getState().nodes.find((n) => n.id === id);

describe("expands spawn math", () => {
    beforeEach(reset);

    it("keeps a constant edge-to-edge gap regardless of child width", () => {
        const flow = useFlow.getState();
        const parentId = flow.addNode({ type: "textGenImageNode" });
        // Simulate a measured parent (480 wide).
        useFlow.setState({
            nodes: useFlow
                .getState()
                .nodes.map((n) =>
                    n.id === parentId
                        ? { ...n, measured: { width: 480, height: 358 } }
                        : n,
                ),
        });

        const [narrowId] = useFlow
            .getState()
            .expands(parentId, [{ type: "textNode" }]);
        const [wideId] = useFlow
            .getState()
            .expands(parentId, [{ type: "imageFusionNode" }]);

        const parent = nodeById(parentId);
        const narrow = nodeById(narrowId);
        const wide = nodeById(wideId);
        if (!parent || !narrow || !wide) throw new Error("nodes missing");

        const parentRight = parent.position.x + 480 / 2;
        const narrowGap =
            narrow.position.x - estimateNodeSize(narrow).w / 2 - parentRight;
        const wideGap =
            wide.position.x - estimateNodeSize(wide).w / 2 - parentRight;
        expect(narrowGap).toBeCloseTo(H_GAP, 1);
        expect(wideGap).toBeCloseTo(H_GAP, 1);
    });

    it("stacks later children below existing ones instead of same-point piling", () => {
        const flow = useFlow.getState();
        const parentId = flow.addNode({ type: "textGenImageNode" });

        const [firstId] = useFlow
            .getState()
            .expands(parentId, [{ type: "imageNode" }]);
        const [secondId] = useFlow
            .getState()
            .expands(parentId, [{ type: "videoNode" }]);

        const first = nodeById(firstId);
        const second = nodeById(secondId);
        if (!first || !second) throw new Error("children missing");

        expect(second.position.y).toBeGreaterThan(first.position.y);
        const gap =
            second.position.y -
            estimateNodeSize(second).h / 2 -
            (first.position.y + estimateNodeSize(first).h / 2);
        expect(gap).toBeCloseTo(V_GAP, 1);
    });

    it("fans out same-call children with height-aware spacing", () => {
        const flow = useFlow.getState();
        const parentId = flow.addNode({ type: "splitTextNode" });
        const ids = useFlow
            .getState()
            .expands(parentId, [
                { type: "textNode" },
                { type: "textNode" },
                { type: "textNode" },
            ]);

        const children = ids
            .map(nodeById)
            .filter((n): n is NonNullable<typeof n> => !!n)
            .sort((a, b) => a.position.y - b.position.y);
        for (let i = 1; i < children.length; i++) {
            const gap =
                children[i].position.y -
                estimateNodeSize(children[i]).h / 2 -
                (children[i - 1].position.y +
                    estimateNodeSize(children[i - 1]).h / 2);
            expect(gap).toBeCloseTo(V_GAP, 1);
        }
    });
});

describe("addNode far-right placement", () => {
    beforeEach(reset);

    it("uses center-origin half-widths for the rightmost edge", () => {
        const flow = useFlow.getState();
        const a = flow.addNode({ type: "textNode" }, { x: 0, y: 0 });
        // Wide node whose CENTER is left of textNode's, but whose right
        // edge sticks out further.
        const b = flow.addNode({ type: "imageFusionNode" }, { x: 100, y: 0 });

        const c = useFlow.getState().addNode({ type: "textNode" });
        const cNode = nodeById(c);
        const bNode = nodeById(b);
        if (!cNode || !bNode) throw new Error("nodes missing");

        // b's right edge = 100 + 240 = 340 beats a's 0 + 128 = 128.
        const expectedX =
            bNode.position.x +
            estimateNodeSize(bNode).w / 2 +
            H_GAP +
            estimateNodeSize(cNode).w / 2;
        expect(cNode.position.x).toBeCloseTo(expectedX, 1);
        expect(a).toBeTruthy();
    });
});

describe("autoLayout store action", () => {
    beforeEach(reset);

    it("commits one layout history entry and undo restores positions", () => {
        const flow = useFlow.getState();
        const a = flow.addNode({ type: "textNode" }, { x: 500, y: 300 });
        const b = flow.addNode(
            { type: "textGenImageNode" },
            { x: 480, y: 900 },
        );
        useFlow.setState({
            edges: [
                {
                    id: "e1",
                    source: a,
                    target: b,
                    type: "custom-edge",
                },
            ],
            historyPast: [],
        });

        const before = new Map(
            useFlow.getState().nodes.map((n) => [n.id, { ...n.position }]),
        );
        const changed = useFlow.getState().autoLayout();
        expect(changed).toBe(true);
        expect(useFlow.getState().historyPast).toHaveLength(1);

        useFlow.getState().undo();
        for (const n of useFlow.getState().nodes) {
            expect(n.position).toEqual(before.get(n.id));
        }
    });

    it("is a silent no-op when nothing would move", () => {
        const flow = useFlow.getState();
        const a = flow.addNode({ type: "textNode" }, { x: 0, y: 0 });
        useFlow.setState({ historyPast: [] });

        // First layout normalizes, second must be a no-op.
        useFlow.getState().autoLayout();
        const positions = useFlow
            .getState()
            .nodes.map((n) => ({ ...n.position }));
        const historyLen = useFlow.getState().historyPast.length;

        const changed = useFlow.getState().autoLayout();
        expect(changed).toBe(false);
        expect(useFlow.getState().historyPast).toHaveLength(historyLen);
        expect(
            useFlow.getState().nodes.map((n) => ({ ...n.position })),
        ).toEqual(positions);
        expect(a).toBeTruthy();
    });

    it("skips history when asked", () => {
        const flow = useFlow.getState();
        const a = flow.addNode({ type: "textNode" }, { x: 500, y: 300 });
        const b = flow.addNode({ type: "textGenImageNode" }, { x: 0, y: 900 });
        useFlow.setState({
            edges: [{ id: "e1", source: a, target: b, type: "custom-edge" }],
            historyPast: [],
        });

        useFlow.getState().autoLayout([a], { history: false });
        expect(useFlow.getState().historyPast).toHaveLength(0);
    });

    it("scopes to the seeded component only", () => {
        const flow = useFlow.getState();
        const a = flow.addNode({ type: "textNode" }, { x: 0, y: 0 });
        const b = flow.addNode({ type: "textGenImageNode" }, { x: 10, y: 10 });
        const far = flow.addNode({ type: "textNode" }, { x: 5000, y: 5000 });
        useFlow.setState({
            edges: [{ id: "e1", source: a, target: b, type: "custom-edge" }],
        });

        useFlow.getState().autoLayout([a], { history: false });
        const farNode = nodeById(far);
        expect(farNode?.position).toEqual({ x: 5000, y: 5000 });
    });
});
