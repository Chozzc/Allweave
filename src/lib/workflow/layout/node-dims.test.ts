import { describe, expect, it } from "vitest";
import { estimateNodeSize } from "./node-dims";

describe("estimateNodeSize", () => {
    it("prefers complete measured dimensions", () => {
        expect(
            estimateNodeSize({
                type: "textNode",
                measured: { width: 320, height: 615 },
            }),
        ).toEqual({ w: 320, h: 615 });
    });

    it("falls back to the static table per type", () => {
        expect(estimateNodeSize({ type: "textNode" })).toEqual({
            w: 256,
            h: 96,
        });
        expect(estimateNodeSize({ type: "addTextNode" })).toEqual({
            w: 480,
            h: 320,
        });
        expect(estimateNodeSize({ type: "imageFusionNode" })).toEqual({
            w: 480,
            h: 780,
        });
    });

    it("uses the executable default for ABI node types not in the table", () => {
        expect(estimateNodeSize({ type: "textGenImageNode" })).toEqual({
            w: 480,
            h: 400,
        });
    });

    it("uses the generic default for unknown types", () => {
        expect(estimateNodeSize({ type: "somethingElse" })).toEqual({
            w: 256,
            h: 80,
        });
    });

    it("ignores partial measured (width only) and falls through", () => {
        expect(
            estimateNodeSize({ type: "textNode", measured: { width: 500 } }),
        ).toEqual({ w: 256, h: 96 });
    });
});
