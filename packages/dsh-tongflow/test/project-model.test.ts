import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderTree, StudioApi } from "../src/api.ts";
import { Config } from "../src/config.ts";
import { ingestOutputs } from "../src/engine/ingest.ts";
import {
    createProject,
    listProjects,
    loadProject,
} from "../src/project/manifest.ts";
import {
    listOutputs,
    nextOutputNo,
    outputFileName,
    parseOutputFileName,
    readRunsLog,
    runsLogKey,
} from "../src/project/outputs.ts";
import {
    fromProjectKey,
    isProjectId,
    normalizeKey,
    projectIdFor,
} from "../src/project/paths.ts";
import {
    expandTemplate,
    hasTemplateRefs,
    resolveFileRef,
} from "../src/project/refs.ts";
import {
    canvasView,
    listWorkflowKeys,
    normalizeWorkflowKey,
    readWorkflowFile,
    writeWorkflowDocument,
} from "../src/project/workflow-file.ts";
import { Studio } from "../src/studio.ts";

let studio: string;
let projectId: string;
let root: string;

beforeEach(async () => {
    studio = await mkdtemp(join(tmpdir(), "dsh-tongflow-"));
    const created = await createProject(studio, {
        title: "Rooftop Rain",
        brief: "a 3-episode manga drama about a rooftop",
    });
    projectId = created.id;
    root = created.root;
});

afterEach(async () => {
    await rm(studio, { recursive: true, force: true });
});

async function put(key: string, content = "x"): Promise<string> {
    const abs = fromProjectKey(root, key);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content);
    return abs;
}

describe("projects", () => {
    it("creates an empty project with only project.json", async () => {
        expect(projectId).toBe("rooftop-rain");
        const ref = await loadProject(studio, projectId);
        expect(ref.manifest.title).toBe("Rooftop Rain");
        expect(ref.manifest.brief).toContain("manga drama");
        const summary = (await listProjects(studio))[0];
        expect(summary.workflowCount).toBe(0);
        expect(summary.fileCount).toBe(1);
    });

    it("derives ids and validates them", async () => {
        expect(projectIdFor("Héllo, World!")).toBe("hello-world");
        expect(projectIdFor("我的短片")).toBe("project");
        expect(isProjectId("a-b1")).toBe(true);
        expect(isProjectId("A_B")).toBe(false);
        const second = await createProject(studio, { title: "Rooftop Rain" });
        expect(second.id).toBe("rooftop-rain-2");
    });

    it("normalizes keys and refuses escapes", () => {
        expect(normalizeKey("./a//b/")).toBe("a/b");
        expect(normalizeKey("a\\b\\c.png")).toBe("a/b/c.png");
        expect(() => normalizeKey("a/../b")).toThrow();
        expect(normalizeWorkflowKey("characters/mei/mei_ref")).toBe(
            "characters/mei/mei_ref.tongflow.json",
        );
        expect(normalizeWorkflowKey("x.json")).toBe("x.tongflow.json");
        expect(normalizeWorkflowKey("x.tongflow.json")).toBe("x.tongflow.json");
    });
});

describe("file references", () => {
    it("resolves ./ against the workflow dir and bare keys against the root (with a dir fallback)", async () => {
        await put("characters/mei/mei_ref.01.png");
        await put("style/palette.png");
        const base = join(root, "characters/mei");
        expect(await resolveFileRef(root, base, "./mei_ref.01.png")).toBe(
            join(root, "characters/mei/mei_ref.01.png"),
        );
        expect(
            await resolveFileRef(root, base, "../../style/palette.png"),
        ).toBe(join(root, "style/palette.png"));
        expect(await resolveFileRef(root, base, "style/palette.png")).toBe(
            join(root, "style/palette.png"),
        );
        // bare name that only exists next to the workflow
        expect(await resolveFileRef(root, base, "mei_ref.01.png")).toBe(
            join(root, "characters/mei/mei_ref.01.png"),
        );
        expect(await resolveFileRef(root, base, "https://x/y.png")).toBe(
            "https://x/y.png",
        );
        await expect(
            resolveFileRef(root, base, "../../../outside.png"),
        ).rejects.toThrow(/escapes/);
        await expect(
            resolveFileRef(root, base, "tf://CHR_MEI/REF"),
        ).rejects.toThrow(/no longer exist/);
    });

    it("expands {{path}} includes with the text file content", async () => {
        await put("style.md", "  cinematic, soft light  \n");
        await put("characters/mei/mei.md", "Mei, 17, short black hair");
        const base = join(root, "characters/mei");
        const text = "{{../../style.md}} {{./mei.md}} full-body sheet";
        expect(hasTemplateRefs(text)).toBe(true);
        expect(hasTemplateRefs("plain")).toBe(false);
        expect(await expandTemplate(root, base, text)).toBe(
            "cinematic, soft light Mei, 17, short black hair full-body sheet",
        );
        await expect(
            expandTemplate(root, base, "{{./missing.md}}"),
        ).rejects.toThrow(/no such text file/);
    });
});

describe("outputs next to the workflow", () => {
    it("names and parses numbered output files", () => {
        expect(outputFileName("mei_ref", 3, "png")).toBe("mei_ref.03.png");
        expect(outputFileName("mei_ref", 12, ".mp4", "video")).toBe(
            "mei_ref.12.video.mp4",
        );
        expect(parseOutputFileName("mei_ref", "mei_ref.03.png")).toEqual({
            no: 3,
            ext: "png",
        });
        expect(parseOutputFileName("mei_ref", "mei_ref.03.video.mp4")).toEqual({
            no: 3,
            output: "video",
            ext: "mp4",
        });
        expect(parseOutputFileName("mei_ref", "mei_ref.tongflow.json")).toBe(
            undefined,
        );
        expect(parseOutputFileName("mei", "mei_ref.03.png")).toBe(undefined);
        expect(runsLogKey("characters/mei/mei_ref.tongflow.json")).toBe(
            "characters/mei/mei_ref.runs.json",
        );
    });

    it("ingests engine outputs as the next number, several outputs keep their names, texts become .txt", async () => {
        const wf = "characters/mei/mei_ref.tongflow.json";
        await put(wf, "{}");
        await put("characters/mei/mei_ref.01.png");
        const record = {
            runId: "run-1",
            workflowHash: "h",
            inputs: {},
            pluginIds: ["p"],
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            durationMs: 1000,
        };
        // Single output → plain number.
        await put(".runs/run-1/a.png", "A");
        let outcome = await ingestOutputs({
            projectRoot: root,
            workflowKey: wf,
            result: {
                status: "success",
                outputs: {},
                outputs_by_name: { image: [".runs/run-1/a.png"] },
                errors: [],
                failures: [],
            },
            record,
        });
        expect(outcome.no).toBe(2);
        expect(outcome.files.map((f) => f.fileName)).toEqual([
            "mei_ref.02.png",
        ]);
        // Two outputs + a text → tagged names and a .txt.
        await put(".runs/run-2/b.png", "B");
        await put(".runs/run-2/c.mp4", "C");
        outcome = await ingestOutputs({
            projectRoot: root,
            workflowKey: wf,
            result: {
                status: "success",
                outputs: {},
                outputs_by_name: {
                    image: [".runs/run-2/b.png"],
                    video: [".runs/run-2/c.mp4"],
                    caption: ["a caption"],
                },
                errors: [],
                failures: [],
            },
            record: { ...record, runId: "run-2", note: "two outputs" },
        });
        expect(outcome.no).toBe(3);
        expect(outcome.files.map((f) => f.fileName).sort()).toEqual([
            "mei_ref.03.caption.txt",
            "mei_ref.03.image.png",
            "mei_ref.03.video.mp4",
        ]);
        expect(
            await readFile(
                join(root, "characters/mei/mei_ref.03.caption.txt"),
                "utf8",
            ),
        ).toBe("a caption");
        const all = await listOutputs(root, wf);
        expect(all.map((o) => o.no)).toEqual([1, 2, 3, 3, 3]);
        expect(all[0].record).toBeUndefined();
        expect(all[1].record?.runId).toBe("run-1");
        expect(all[2].record?.note).toBe("two outputs");
        const log = await readRunsLog(root, wf);
        expect(log.map((r) => r.no)).toEqual([2, 3]);
        expect(await nextOutputNo(root, wf)).toBe(4);
    });
});

describe("workflow files", () => {
    it("lists workflows anywhere in the project and hands the canvas root-relative refs", async () => {
        const wf = "ep01/sh010/keyframe.tongflow.json";
        await writeWorkflowDocument(root, wf, {
            name: "keyframe",
            flow: {
                nodes: [
                    {
                        id: "img",
                        type: "imageNode",
                        position: { x: 0, y: 0 },
                        data: {
                            fileKeys: [
                                "../../characters/mei/mei_ref.02.png",
                                "./plate.png",
                                "style/palette.png",
                                "https://x/y.png",
                            ],
                        },
                    },
                ] as never,
                edges: [],
            },
            meta: {},
        });
        await writeWorkflowDocument(root, "loose.tongflow.json", {
            name: "loose",
            flow: { nodes: [], edges: [] },
            meta: {},
        });
        expect(await listWorkflowKeys(root)).toEqual([
            "ep01/sh010/keyframe.tongflow.json",
            "loose.tongflow.json",
        ]);
        const doc = await readWorkflowFile(root, wf);
        const view = canvasView(doc, wf);
        expect(
            (view.flow.nodes[0].data as { fileKeys: string[] }).fileKeys,
        ).toEqual([
            "characters/mei/mei_ref.02.png",
            "ep01/sh010/plate.png",
            "style/palette.png",
            "https://x/y.png",
        ]);
        // The file itself is untouched.
        expect(
            (doc.flow.nodes[0].data as { fileKeys: string[] }).fileKeys[0],
        ).toBe("../../characters/mei/mei_ref.02.png");
    });
});

describe("studio tree", () => {
    it("nests generated files under their workflow and shows everything else as-is", async () => {
        const api = new StudioApi(
            new Studio({ config: Config({ studioRoot: studio }) }),
        );
        await put("README.md", "# plan");
        await put("characters/mei/mei.md", "Mei");
        await writeWorkflowDocument(
            root,
            "characters/mei/mei_ref.tongflow.json",
            { name: "mei_ref", flow: { nodes: [], edges: [] }, meta: {} },
        );
        await put("characters/mei/mei_ref.01.png");
        await put("characters/mei/mei_ref.02.png");
        await put("characters/mei/mei_ref.runs.json", "[]");
        await put("characters/mei/other.png");
        const tree = await api.tree(projectId);
        const text = renderTree(tree);
        expect(text).toBe(
            [
                "characters/",
                "  mei/",
                "    mei_ref.tongflow.json  [workflow, 2 output files]",
                "      mei_ref.01.png",
                "      mei_ref.02.png",
                "    mei.md",
                "    other.png",
                "project.json",
                "README.md",
            ].join("\n"),
        );
        const mei = tree[0].children![0];
        const wf = mei.children!.find((n) => n.kind === "workflow")!;
        expect(wf.meta?.outputCount).toBe(2);
        expect(wf.children!.map((n) => n.label)).toEqual(["01.png", "02.png"]);
        expect(mei.children!.map((n) => n.label)).not.toContain(
            "mei_ref.runs.json",
        );
        const status = await api.status(projectId);
        expect(status.workflows[0]).toMatchObject({
            key: "characters/mei/mei_ref.tongflow.json",
            outputs: 2,
            lastNo: 2,
        });
    });
});

describe("billing checkpoint", () => {
    it("stops on plugins the project has not approved, then remembers the answer", async () => {
        const api = new StudioApi(
            new Studio({ config: Config({ studioRoot: studio }) }),
        );
        // A fake registry: one API plugin with models, one Modal plugin, same slot.
        (
            api.studio.registry as unknown as {
                cache: unknown;
            }
        ).cache = {
            registry: {
                plugins: {
                    "tongflow-api-gemini": {
                        name: "Gemini",
                        needsDeploy: false,
                        methodsByNodeSlot: {
                            "image-gen": {
                                methodName: "image_gen",
                                models: ["gemini-3-pro-image", "imagen-4"],
                            },
                        },
                    },
                    "tongflow-modal-flux": {
                        needsDeploy: true,
                        methodsByNodeSlot: {
                            "image-gen": { methodName: "image_gen" },
                        },
                    },
                },
                nodePluginMap: {
                    "image-gen": ["tongflow-api-gemini", "tongflow-modal-flux"],
                },
            },
            meta: {
                "tongflow-api-gemini": {
                    env: [{ key: "GEMINI_API_KEY", required: true }],
                },
                "tongflow-modal-flux": { env: [] },
            },
            scannedAt: "now",
        };
        const wf = "hero/hero_shot.tongflow.json";
        await writeWorkflowDocument(root, wf, {
            name: "hero_shot",
            flow: { nodes: [], edges: [] },
            executable: {
                inputs: [],
                outputs: [],
                dataNodes: [],
                executableNodes: [
                    {
                        id: "g",
                        feature: "image-gen",
                        pluginId: "tongflow-api-gemini",
                        model: "imagen-4",
                        bindings: {},
                        outputs: [],
                    },
                ],
            } as never,
            meta: {},
        });
        let pending = await api.unapprovedPlugins(projectId, wf);
        expect(pending).toHaveLength(1);
        expect(pending[0]).toMatchObject({
            pluginId: "tongflow-api-gemini",
            name: "Gemini",
            billing: "api",
            models: ["imagen-4"],
            availableModels: ["gemini-3-pro-image", "imagen-4"],
            slots: ["image-gen"],
            env: [{ key: "GEMINI_API_KEY", required: true, set: false }],
            alternatives: [
                {
                    pluginId: "tongflow-modal-flux",
                    billing: "modal",
                    slots: ["image-gen"],
                },
            ],
        });
        // Approve a different model only → still pending for imagen-4.
        await api.approvePlugin(projectId, "tongflow-api-gemini", {
            model: "gemini-3-pro-image",
        });
        pending = await api.unapprovedPlugins(projectId, wf);
        expect(pending).toHaveLength(1);
        // Approve the model the workflow uses → clear.
        await api.approvePlugin(projectId, "tongflow-api-gemini", {
            model: "imagen-4",
            note: "user said ok",
        });
        expect(await api.unapprovedPlugins(projectId, wf)).toEqual([]);
        const ref = await loadProject(studio, projectId);
        expect(ref.manifest.plugins?.["tongflow-api-gemini"]).toMatchObject({
            models: ["gemini-3-pro-image", "imagen-4"],
            note: "user said ok",
        });
        // Revoke → asked again; approving without a model covers every model.
        await api.revokePlugin(projectId, "tongflow-api-gemini");
        expect(await api.unapprovedPlugins(projectId, wf)).toHaveLength(1);
        await api.approvePlugin(projectId, "tongflow-api-gemini");
        expect(await api.unapprovedPlugins(projectId, wf)).toEqual([]);
        await expect(
            api.approvePlugin(projectId, "not-installed"),
        ).rejects.toThrow(/not installed/);
    });
});
