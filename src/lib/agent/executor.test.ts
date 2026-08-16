/**
 * Patch-applier semantics that must not regress:
 *  - unknown node types fail with suggestions (hallucination guard)
 *  - alias edges route through `expands` and land ABI handles
 *  - collect-many handles accept several edges on the same target handle
 *  - update_nodes merges into node.data (updates() replaces wholesale)
 *  - `prompt` stays agent-unwritable; attachments substitute real fileKeys
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// The flow store persists to localStorage on every mutation.
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
});

// The workspace API client transitively imports .tsx UI (toast); vitest runs
// without JSX transform, and these tests never touch the network anyway.
vi.mock("@/lib/api/workspace", () => ({
    getWorkflow: vi.fn(),
    listWorkflows: vi.fn(),
    saveWorkflow: vi.fn(),
}));
vi.mock("@/lib/api/task", () => ({
    createTask: vi.fn(),
    updateTaskStatus: vi.fn(),
}));

import type { AgentAttachment } from "tongflow";
import useFlow from "@/hooks/use-flow";
import { applyGraphPatch } from "./executor";

const ATTACHMENTS: AgentAttachment[] = [
    {
        index: 1,
        fileKey: "tasks/upload/cat.png",
        url: "https://example.test/cat.png",
        name: "cat.png",
        mime: "image/png",
        modality: "imageNode",
        addNodeType: "addImageNode",
    },
];

function reset() {
    useFlow.setState({
        nodes: [],
        edges: [],
        historyPast: [],
        historyFuture: [],
    });
}

describe("applyGraphPatch", () => {
    beforeEach(reset);

    it("rejects unknown node types with close suggestions", async () => {
        const result = await applyGraphPatch(
            { add_nodes: [{ alias: "x", type: "textToImageNode" }] },
            [],
            "t1",
        );
        expect(result.ok).toBe(false);
        const steps = (result as unknown as { steps: { hint?: string }[] })
            .steps;
        expect(steps[0].hint).toContain("textGenImageNode");
        expect(useFlow.getState().nodes).toHaveLength(0);
    });

    it("builds a fully alternating chain with ABI handles via expands", async () => {
        // add → data → executable → data → executable → data
        const result = await applyGraphPatch(
            {
                add_nodes: [
                    { alias: "add1", type: "addImageNode", fromAttachment: 1 },
                    { alias: "src", type: "imageNode", fromAttachment: 1 },
                    {
                        alias: "genVid",
                        type: "imageGenVideoNode",
                        data: { text: "walking", duration: 5 },
                    },
                    { alias: "vid", type: "videoNode" },
                ],
                add_edges: [
                    { from: "add1", to: "src" },
                    { from: "src", to: "genVid" },
                    { from: "genVid", to: "vid" },
                ],
            },
            ATTACHMENTS,
            "t2",
        );
        expect(result.ok).toBe(true);

        const { nodes, edges } = useFlow.getState();
        expect(nodes).toHaveLength(4);
        expect(edges).toHaveLength(3);
        const intoExec = edges.find((e) => e.targetHandle === "in:image");
        expect(intoExec?.sourceHandle).toBe("out:imageNode");
        // Executable output flows into the pre-created empty result node.
        const outOfExec = edges.find((e) => e.targetHandle === "in:videoNode");
        expect(outOfExec?.sourceHandle).toBe("out:video");
    });

    it("rejects executable→executable edges with a repair hint", async () => {
        const result = await applyGraphPatch(
            {
                add_nodes: [
                    { alias: "genImg", type: "textGenImageNode" },
                    {
                        alias: "genVid",
                        type: "imageGenVideoNode",
                        data: { text: "walking" },
                    },
                ],
                add_edges: [{ from: "genImg", to: "genVid" }],
            },
            [],
            "t2c",
        );
        expect(result.ok).toBe(false);
        const steps = (
            result as unknown as {
                steps: { op: string; ok: boolean; error?: string }[];
            }
        ).steps;
        const edgeStep = steps.find((s) => s.op === "add_edge");
        expect(edgeStep?.ok).toBe(false);
        expect(edgeStep?.error).toContain("insert an empty imageNode");
        // The invalid edge must not be created.
        expect(useFlow.getState().edges).toHaveLength(0);
    });

    it("wires promoted (sourceSpec) handles without any component mounted", async () => {
        // textGenImageNode's `text: batchOn` is a sourceSpec promotion of a
        // plain-string ABI input. It lives in the static NODE_TYPE_SOURCE_SPEC
        // registry, so the target handle resolves headlessly — no mount heal.
        const result = await applyGraphPatch(
            {
                add_nodes: [
                    {
                        alias: "t1",
                        type: "textNode",
                        data: { texts: ["a cat"] },
                    },
                    { alias: "img", type: "textGenImageNode" },
                ],
                add_edges: [{ from: "t1", to: "img" }],
            },
            [],
            "t2b",
        );
        expect(result.ok).toBe(true);

        const { edges } = useFlow.getState();
        expect(edges).toHaveLength(1);
        expect(edges[0].sourceHandle).toBe("out:textNode");
        expect(edges[0].targetHandle).toBe("in:text");
    });

    it("routes several sources onto a collect-many handle", async () => {
        const result = await applyGraphPatch(
            {
                add_nodes: [
                    { alias: "a", type: "imageNode", fromAttachment: 1 },
                    { alias: "b", type: "imageNode", fromAttachment: 1 },
                    { alias: "fuse", type: "imageFusionNode" },
                ],
                add_edges: [
                    { from: "a", to: "fuse" },
                    { from: "b", to: "fuse" },
                ],
            },
            ATTACHMENTS,
            "t3",
        );
        expect(result.ok).toBe(true);

        const { edges } = useFlow.getState();
        const fuseEdges = edges.filter((e) => e.targetHandle === "in:images");
        expect(fuseEdges).toHaveLength(2);
    });

    it("merges update_nodes into existing data", async () => {
        await applyGraphPatch(
            {
                add_nodes: [
                    {
                        alias: "vid",
                        type: "imageGenVideoNode",
                        data: { text: "drinking", duration: 5 },
                    },
                ],
            },
            [],
            "t4",
        );
        const id = useFlow.getState().nodes[0].id;

        const result = await applyGraphPatch(
            { update_nodes: [{ id: id.slice(0, 8), data: { duration: 10 } }] },
            [],
            "t5",
        );
        expect(result.ok).toBe(true);

        const data = useFlow.getState().nodes[0].data as Record<
            string,
            unknown
        >;
        // Changed key updated, untouched key preserved (merge, not replace).
        expect(data.duration).toBe(10);
        expect(data.text).toBe("drinking");
    });

    it("refuses to write the derived prompt field", async () => {
        await applyGraphPatch(
            { add_nodes: [{ alias: "n", type: "textGenImageNode" }] },
            [],
            "t6",
        );
        const id = useFlow.getState().nodes[0].id;
        const result = await applyGraphPatch(
            { update_nodes: [{ id, data: { prompt: { text: "x" } } }] },
            [],
            "t7",
        );
        expect(result.ok).toBe(false);
    });

    it("substitutes attachment fileKeys and rejects bad indices", async () => {
        const ok = await applyGraphPatch(
            {
                add_nodes: [
                    { alias: "src", type: "addImageNode", fromAttachment: 1 },
                ],
            },
            ATTACHMENTS,
            "t8",
        );
        expect(ok.ok).toBe(true);
        const data = useFlow.getState().nodes[0].data as Record<
            string,
            unknown
        >;
        expect(data.fileKeys).toEqual(["tasks/upload/cat.png"]);

        const bad = await applyGraphPatch(
            {
                add_nodes: [
                    { alias: "x", type: "addImageNode", fromAttachment: 9 },
                ],
            },
            ATTACHMENTS,
            "t9",
        );
        expect(bad.ok).toBe(false);
    });

    it("resolves references against existing canvas nodes", async () => {
        await applyGraphPatch(
            {
                add_nodes: [
                    {
                        alias: "t1",
                        type: "textNode",
                        data: { texts: ["hello"] },
                    },
                ],
            },
            [],
            "t10",
        );
        const existingId = useFlow.getState().nodes[0].id;

        // Second patch references the first patch's node by short id.
        const result = await applyGraphPatch(
            {
                add_nodes: [{ alias: "img", type: "textGenImageNode" }],
                add_edges: [{ from: existingId.slice(0, 8), to: "img" }],
            },
            [],
            "t11",
        );
        expect(result.ok).toBe(true);
        expect(useFlow.getState().edges).toHaveLength(1);
    });
});
