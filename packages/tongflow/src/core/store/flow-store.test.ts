import { describe, expect, it } from "vitest";
import { addEdgeIfAbsent, createFlowStore } from "./flow-store";

function seq() {
    let n = 0;
    return () => `id-${++n}`;
}

describe("createFlowStore (headless)", () => {
    it("adds a node and reports it via onNodeCreated", () => {
        const store = createFlowStore({ createId: seq() });
        const created: string[][] = [];
        store.getState().onNodeCreated((ids) => created.push(ids));
        const id = store.getState().addNode({ type: "textNode" });
        expect(id).toBe("id-1");
        expect(store.getState().nodes.map((n) => n.id)).toEqual(["id-1"]);
        expect(created).toEqual([["id-1"]]);
    });

    it("expands an ABI node into wired downstream data nodes", () => {
        const store = createFlowStore({ createId: seq() });
        const s = store.getState();
        const src = s.addNode({ type: "textNode", data: { texts: ["hi"] } });
        const gen = s.addNode({ type: "textGenImageNode" });
        s.setEdges([
            { id: "e", source: src, target: gen, targetHandle: "in:text" },
        ]);

        const [img] = store.getState().expands(gen, [{ type: "imageNode" }]);
        const state = store.getState();
        expect(state.nodes.find((n) => n.id === img)?.type).toBe("imageNode");
        const edge = state.edges.find((e) => e.target === img);
        expect(edge?.source).toBe(gen);
        expect(edge?.sourceHandle).toBe("out:image");
        expect(edge?.targetHandle).toBe("in:imageNode");

        // Expanding again reuses the existing sibling instead of spawning.
        const [again] = store.getState().expands(gen, [{ type: "imageNode" }]);
        expect(again).toBe(img);
        expect(store.getState().nodes).toHaveLength(3);
    });

    it("composes the combo selection into a new node with distinct handles", () => {
        const store = createFlowStore({ createId: seq() });
        const s = store.getState();
        const a = s.addNode({ type: "imageNode" });
        const b = s.addNode({ type: "textNode" });
        s.toggleCombo(a);
        s.toggleCombo(b);
        expect(store.getState().comboMode).toBe(true);

        const id = store.getState().compose({
            type: "imageGenVideoComposeNode",
            data: {},
        });
        const state = store.getState();
        const incoming = state.edges.filter((e) => e.target === id);
        expect(incoming.map((e) => e.targetHandle).sort()).toEqual([
            "in:image",
            "in:text",
        ]);
        expect(state.comboMode).toBe(false);
        expect(state.comboSelectedIds.size).toBe(0);
    });

    it("undo / redo restore prior snapshots and coalesce same-source edits", () => {
        const store = createFlowStore({ createId: seq() });
        const id = store.getState().addNode({ type: "textNode" });
        store.getState().updates(id, { texts: ["a"] });
        store.getState().updates(id, { texts: ["ab"] }); // coalesces (same source)
        expect(store.getState().historyPast).toHaveLength(2);

        store.getState().undo();
        expect(store.getState().nodes[0].data).toEqual({});
        store.getState().undo();
        expect(store.getState().nodes).toHaveLength(0);
        store.getState().redo();
        expect(store.getState().nodes).toHaveLength(1);
        store.getState().redo();
        expect(store.getState().nodes[0].data).toEqual({ texts: ["ab"] });
        expect(store.getState().historyFuture).toHaveLength(0);
    });

    it("removeNode drops attached edges; pruneEdgesOf handles host removals", () => {
        const store = createFlowStore({ createId: seq() });
        const s = store.getState();
        const a = s.addNode({ type: "textNode" });
        const b = s.addNode({ type: "textNode" });
        s.setEdges([{ id: "e", source: a, target: b }]);
        store.getState().removeNode(b);
        expect(store.getState().edges).toHaveLength(0);
        store.getState().setEdges([{ id: "e2", source: a, target: "ghost" }]);
        store.getState().pruneEdgesOf(["ghost"]);
        expect(store.getState().edges).toHaveLength(0);
    });

    it("autoLayout moves nodes and records one history entry", () => {
        const store = createFlowStore({ createId: seq() });
        const s = store.getState();
        const a = s.addNode({ type: "textNode" }, { x: 0, y: 0 });
        const b = s.addNode({ type: "textGenImageNode" }, { x: 0, y: 0 });
        s.setEdges([
            { id: "e", source: a, target: b, targetHandle: "in:text" },
        ]);
        const before = store.getState().historyPast.length;
        expect(store.getState().autoLayout()).toBe(true);
        expect(store.getState().historyPast).toHaveLength(before + 1);
        const [na, nb] = store.getState().nodes;
        expect(nb.position.x).toBeGreaterThan(na.position.x);
    });

    it("addEdgeIfAbsent dedupes identical connections", () => {
        const e = { id: "e", source: "a", target: "b", targetHandle: "in:x" };
        const once = addEdgeIfAbsent(e, []);
        expect(addEdgeIfAbsent({ ...e, id: "e2" }, once)).toHaveLength(1);
        expect(
            addEdgeIfAbsent({ ...e, id: "e3", targetHandle: "in:y" }, once),
        ).toHaveLength(2);
    });
});
