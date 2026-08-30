import { describe, expect, it } from "vitest";
import { mergeBrowserEnv } from "@/lib/browser-storage";

describe("mergeBrowserEnv", () => {
    it("keeps server-only keys and promotes browser-owned credentials", () => {
        expect(
            mergeBrowserEnv(
                { OPENROUTER_API_KEY: "server", SERVER_ONLY: "kept" },
                {
                    OPENROUTER_API_KEY: "browser",
                    MODAL_TOKEN_ID: "ak-test",
                    MODAL_TOKEN_SECRET: "as-test",
                },
            ),
        ).toEqual({
            OPENROUTER_API_KEY: "browser",
            SERVER_ONLY: "kept",
            MODAL_TOKEN_ID: "ak-test",
            MODAL_TOKEN_SECRET: "as-test",
        });
    });
});
