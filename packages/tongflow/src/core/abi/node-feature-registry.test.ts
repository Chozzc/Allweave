import { describe, expect, it } from "vitest";
import { ABI_NODES } from "../generated/abi/index";
import {
    abiSpecForNodeType,
    isAbiNodeType,
    NODE_TYPE_SOURCE_SPEC,
    NODE_TYPE_TO_ABI_FEATURE,
    resolvedSpecForNodeType,
} from "./node-feature-registry";

describe("static ABI node registry", () => {
    it("maps every ABI node type to a real ABI slot", () => {
        for (const [nodeType, feature] of Object.entries(
            NODE_TYPE_TO_ABI_FEATURE,
        )) {
            expect(feature in ABI_NODES, `${nodeType} → ${feature}`).toBe(true);
        }
    });

    it("only carries sourceSpec overrides for known node types", () => {
        for (const nodeType of Object.keys(NODE_TYPE_SOURCE_SPEC)) {
            expect(isAbiNodeType(nodeType), nodeType).toBe(true);
        }
    });

    it("resolves a full spec for every ABI node type without any mount", () => {
        for (const nodeType of Object.keys(NODE_TYPE_TO_ABI_FEATURE)) {
            const abi = abiSpecForNodeType(nodeType);
            expect(abi?.feature).toBe(NODE_TYPE_TO_ABI_FEATURE[nodeType]);
            const spec = resolvedSpecForNodeType(nodeType);
            expect(spec, nodeType).toBeDefined();
            expect(spec?.topology.feature).toBe(abi?.feature);
            // Every override names a real input of the slot.
            for (const field of Object.keys(abi?.sourceSpec ?? {})) {
                expect(
                    spec?.topology.inputOrder,
                    `${nodeType}.${field}`,
                ).toContain(field);
            }
        }
    });

    it("returns undefined for data / add / unknown node types", () => {
        for (const t of [
            "textNode",
            "imageNode",
            "addTextNode",
            "nope",
            undefined,
        ]) {
            expect(abiSpecForNodeType(t)).toBeUndefined();
            expect(resolvedSpecForNodeType(t)).toBeUndefined();
        }
    });

    it("promotes plain-string ABI inputs to handles where the canvas does", () => {
        // gen-text.text is a plain string in the ABI (config by topology); the
        // canvas exposes it as a batch text handle.
        const gen = resolvedSpecForNodeType("genTextNode");
        expect(gen?.fields.text.kind).toBe("handle");
        expect(gen?.batchField).toBe("text");
        // image-gen.text likewise.
        expect(
            resolvedSpecForNodeType("textGenImageNode")?.fields.text.kind,
        ).toBe("handle");
        // Types with no overrides still resolve to the bare topology.
        expect(resolvedSpecForNodeType("musicCoverNode")).toBeDefined();
    });

    it("memoizes the resolved spec per node type", () => {
        expect(resolvedSpecForNodeType("genTextNode")).toBe(
            resolvedSpecForNodeType("genTextNode"),
        );
    });
});
