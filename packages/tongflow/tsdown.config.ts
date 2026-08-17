import { defineConfig } from "tsdown";

/**
 * Two entries:
 *  - `index`  → `tongflow`        (framework-free core; platform neutral)
 *  - `canvas` → `tongflow/canvas` (React canvas; browser)
 * Dependencies / peers stay external; only the source tree is bundled.
 * The canvas entry keeps its "use client" directive at the top of the chunk
 * (rolldown preserves module directives) so RSC bundlers treat it as a
 * client boundary.
 */
export default defineConfig([
    {
        entry: { index: "src/core/index.ts" },
        format: ["esm", "cjs"],
        platform: "neutral",
        dts: true,
        sourcemap: false,
        clean: true,
        outDir: "dist",
    },
    {
        entry: { canvas: "src/canvas/index.ts" },
        format: ["esm", "cjs"],
        platform: "browser",
        dts: true,
        sourcemap: false,
        clean: false,
        outDir: "dist",
        // Externalize dynamic imports too (three/examples/*, @sparkjsdev/spark)
        // so nothing heavy is inlined; the consumer installs the deps.
        external: [/^three(\/|$)/, /^@sparkjsdev\//],
    },
]);
