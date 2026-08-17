import { describe, expect, it } from "vitest";
import { TONGFLOW_PACKAGE } from "./index";

describe("tongflow core entry", () => {
    it("exports the package marker", () => {
        expect(TONGFLOW_PACKAGE).toBe("tongflow");
    });
});
