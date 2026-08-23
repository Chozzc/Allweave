import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pluginReadme } from "../src/tools/run-tools.ts";

/**
 * Only the path travels in the plugins catalog — the installed READMEs run to
 * thousands of lines together, and the agent reads one when it needs it. A
 * plugin without a README must not gain an empty or dangling `readme` field.
 */
describe("pluginReadme", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "tf-readme-"));
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("gives the path when the plugin shipped one", async () => {
        await mkdir(join(dir, "tongflow-api-gemini"), { recursive: true });
        const path = join(dir, "tongflow-api-gemini", "README.md");
        await writeFile(path, "# tongflow-api-gemini\n");
        expect(await pluginReadme(dir, "tongflow-api-gemini")).toEqual({
            readme: path,
        });
    });

    it("stays silent for a plugin without one", async () => {
        await mkdir(join(dir, "tongflow-modal-bare"), { recursive: true });
        expect(await pluginReadme(dir, "tongflow-modal-bare")).toEqual({});
    });

    it("stays silent for a plugin directory that is not there", async () => {
        expect(await pluginReadme(dir, "never-installed")).toEqual({});
    });

    it("does not mistake a README directory for a file", async () => {
        await mkdir(join(dir, "odd", "README.md"), { recursive: true });
        expect(await pluginReadme(dir, "odd")).toEqual({});
    });
});
