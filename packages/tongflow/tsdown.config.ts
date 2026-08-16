import { defineConfig } from "tsdown";

// Core entry only for now; the `./canvas` React entry is added in a later phase.
export default defineConfig({
    entry: { index: "src/core/index.ts" },
    format: ["esm", "cjs"],
    platform: "neutral",
    dts: true,
    sourcemap: false,
    clean: true,
    outDir: "dist",
});
