import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { neighborhood, renderCanvas, resolveNodeRef } from "./serialize";

const node = (id: string, type: string, data: Record<string, unknown> = {}) =>
    ({ id, type, position: { x: 0, y: 0 }, data }) as Node;

const edge = (
    source: string,
    target: string,
    handles: { sourceHandle?: string; targetHandle?: string } = {},
) => ({ id: `${source}-${target}`, source, target, ...handles }) as Edge;

describe("renderCanvas", () => {
    it("hides derived keys and summarizes file keys", () => {
        const out = renderCanvas(
            [
                node("aaaa1111-x", "textGenImageNode", {
                    texts: ["a cat"],
                    prompt: { text: "a cat" },
                    feature: "image-gen",
                    width: 1024,
                }),
                node("bbbb2222-x", "imageNode", {
                    fileKeys: ["tasks/abc/def.png", "tasks/abc/ghi.png"],
                }),
            ],
            [],
        );
        expect(out).toContain("width=1024");
        expect(out).not.toContain("prompt");
        expect(out).not.toContain("feature");
        // Storage keys never appear verbatim.
        expect(out).not.toContain("tasks/abc/def.png");
        expect(out).toContain("files=2×png");
    });

    it("truncates long text to the digest budget", () => {
        const long = "x".repeat(500);
        const out = renderCanvas(
            [node("aaaa1111-x", "textNode", { texts: [long] })],
            [],
            { maxText: 60 },
        );
        expect(out).not.toContain(long);
        expect(out).toContain(`${"x".repeat(60)}…`);
    });

    it("marks selection and execution status", () => {
        const out = renderCanvas(
            [node("aaaa1111-x", "textNode", { texts: ["hi"] })],
            [],
            {
                selectedIds: ["aaaa1111-x"],
                statusByNodeId: new Map([["aaaa1111-x", "running"]]),
            },
        );
        expect(out).toContain("[running]");
        expect(out).toContain("user-selected: aaaa1111");
    });
});

describe("resolveNodeRef", () => {
    const nodes = [
        node("aaaa1111-2222-3333", "textNode"),
        node("aaaa9999-8888-7777", "imageNode"),
        node("bbbb0000-1111-2222", "videoNode"),
    ];

    it("resolves aliases first, then exact ids, then short ids", () => {
        const aliases = new Map([["t1", "bbbb0000-1111-2222"]]);
        expect(resolveNodeRef("t1", nodes, aliases).id).toBe(
            "bbbb0000-1111-2222",
        );
        expect(resolveNodeRef("aaaa1111-2222-3333", nodes).id).toBe(
            "aaaa1111-2222-3333",
        );
        expect(resolveNodeRef("bbbb0000", nodes).id).toBe("bbbb0000-1111-2222");
    });

    it("flags ambiguous short ids instead of guessing", () => {
        expect(resolveNodeRef("aaaa", nodes)).toEqual({ ambiguous: true });
        expect(resolveNodeRef("cccc", nodes)).toEqual({});
    });
});

describe("neighborhood", () => {
    it("walks both directions up to the hop limit", () => {
        const edges = [
            edge("a", "b"),
            edge("b", "c"),
            edge("c", "d"),
            edge("x", "a"),
        ];
        const around = neighborhood("b", edges, 1);
        expect([...around].sort()).toEqual(["a", "b", "c"]);
        const wider = neighborhood("b", edges, 2);
        expect(wider.has("d")).toBe(true);
        expect(wider.has("x")).toBe(true);
    });
});
