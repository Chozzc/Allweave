import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import exampleWorkflow from "../../../test/fixtures/example.json";
import { exportWorkflow } from "./exporter";

/**
 * Headless export: no React, no mounted components — the exporter resolves
 * every ABI node from the static node-type registry alone.
 */
describe("exportWorkflow (headless)", () => {
    const { nodes, edges } = (
        exampleWorkflow as unknown as {
            originalFlow: { nodes: Node[]; edges: Edge[] };
        }
    ).originalFlow;

    it("recognizes every executable node in the bundled example", () => {
        const wf = exportWorkflow(nodes, edges, { name: "example" });
        const byType = Object.fromEntries(
            wf.executableNodes.map((n) => [n.type, n]),
        );
        expect(wf.executableNodes).toHaveLength(4);
        expect(byType.textGenImageNode?.feature).toBe("image-gen");
        expect(byType.imageFusionNode?.feature).toBe("image-fusion");
        expect(byType.imageGenVideoNode?.feature).toBe("image-gen-video");
    });

    it("binds sourceSpec-promoted handles (image-gen.text) headlessly", () => {
        const wf = exportWorkflow(nodes, edges);
        const gen = wf.executableNodes.find(
            (n) => n.type === "textGenImageNode",
        );
        const text = gen?.bindings.text;
        expect(text?.kind).toBe("handle");
        if (text?.kind === "handle") {
            expect(text.targetHandle).toBe("in:text");
            expect(text.sources).toHaveLength(1);
        }
        expect(gen?.batchField).toBe("text");
    });

    it("is deterministic across calls", () => {
        const a = exportWorkflow(nodes, edges);
        const b = exportWorkflow(nodes, edges);
        const strip = (w: unknown) =>
            JSON.stringify(w, (k, v) => (k === "exportedAt" ? undefined : v));
        expect(strip(a)).toBe(strip(b));
    });
});
