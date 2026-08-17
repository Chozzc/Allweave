import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            tongflow: path.resolve(
                __dirname,
                "./packages/tongflow/src/core/index.ts",
            ),
        },
    },
});
