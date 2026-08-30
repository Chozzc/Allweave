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

    it("uses paid HTTP APIs for the competition product demo", () => {
        const product = buildWorkflowTemplates().find(
            (template) => template.key === "product-commercial",
        );
        expect(product).toBeDefined();
        const plugins = product?.nodes
            .map((node) => node.data.pluginId)
            .filter(Boolean);
        expect(plugins).toContain("tongflow-router-openrouter");
        expect(plugins).toContain("tongflow-router-toapis");
        expect(plugins).not.toContain("tongflow-modal-z-image");
        expect(plugins).not.toContain("tongflow-modal-minimax-h3");
    });
});
