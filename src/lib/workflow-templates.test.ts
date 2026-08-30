import { isWorkflowValid } from "tongflow";
import { describe, expect, it } from "vitest";
import { buildWorkflowTemplates } from "./workflow-templates";

describe("built-in workflow templates", () => {
    it("builds three valid native TongFlow graphs", () => {
        const templates = buildWorkflowTemplates();
        expect(templates).toHaveLength(3);
        for (const template of templates) {
            expect(
                isWorkflowValid({
                    nodes: template.nodes,
                    edges: template.edges,
                }),
            ).toBe(true);
            expect(template.executable.executableNodes.length).toBeGreaterThan(
                0,
            );
        }
    });
});
