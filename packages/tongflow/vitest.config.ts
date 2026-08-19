import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        css: false,
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
