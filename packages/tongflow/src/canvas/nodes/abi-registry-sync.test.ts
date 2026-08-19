/**
 * Drift guard: every ABI node component registered in `types.tsx` must have a
 * matching entry in the static `NODE_TYPE_TO_ABI_FEATURE` registry (and vice
 * versa), with the same `feature` the component renders. The registry is the
 * single source of truth for headless export / validation, so a component
 * that isn't in it would export as an unknown node.
 *
 * Reads the component sources as text — no React needed.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NODE_TYPE_TO_ABI_FEATURE } from "../../core/abi/node-feature-registry";

/** packages/tongflow/src/canvas */
const CANVAS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

/** nodeType → component file, from the `NODE_TYPES` map in node-types.tsx. */
function nodeTypeFiles(): Record<string, string> {
    const src = readFileSync(join(CANVAS_DIR, "node-types.tsx"), "utf8");
    const imports = new Map<string, string>();
    for (const m of src.matchAll(/import (\w+) from "\.\/(nodes\/[^"]+)";/g)) {
        imports.set(m[1], join(CANVAS_DIR, `${m[2]}.tsx`));
    }
    const out: Record<string, string> = {};
    for (const m of src.matchAll(/\n\s+(\w+): (\w+),/g)) {
        const file = imports.get(m[2]);
        if (file) out[m[1]] = file;
    }
    return out;
}

describe("ABI node components ↔ static registry", () => {
    const files = nodeTypeFiles();
    const componentFeature: Record<string, string> = {};
    for (const [nodeType, file] of Object.entries(files)) {
        const m = readFileSync(file, "utf8").match(/feature="([^"]+)"/);
        if (m) componentFeature[nodeType] = m[1];
    }

    it("finds the node components", () => {
        expect(Object.keys(componentFeature).length).toBeGreaterThan(40);
    });

    it("every ABI component is in the registry with the same feature", () => {
        for (const [nodeType, feature] of Object.entries(componentFeature)) {
            expect(NODE_TYPE_TO_ABI_FEATURE[nodeType], nodeType).toBe(feature);
        }
    });

    it("every registry entry has a component", () => {
        for (const nodeType of Object.keys(NODE_TYPE_TO_ABI_FEATURE)) {
            expect(componentFeature[nodeType], nodeType).toBeDefined();
        }
    });

    it("no component carries its own sourceSpec (registry is the truth)", () => {
        for (const file of walk(join(CANVAS_DIR, "nodes"))) {
            if (!file.endsWith(".tsx")) continue;
            expect(readFileSync(file, "utf8"), file).not.toMatch(/sourceSpec=/);
        }
    });
});
