import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEntity, listEntities, upsertEntity } from "../src/project/bible.ts";
import {
    findShot,
    readBreakdown,
    writeBreakdown,
} from "../src/project/breakdown.ts";
import { listProjects, loadProject } from "../src/project/manifest.ts";
import { fromProjectKey } from "../src/project/paths.ts";
import { resolveRef } from "../src/project/refs.ts";
import {
    addTake,
    circleTake,
    deleteTake,
    listTakes,
    resolveTake,
} from "../src/project/takes.ts";
import { createProject, listTemplates } from "../src/project/templates.ts";

let studio: string;
let projectId: string;
let root: string;

async function fixture(name: string, content = "x"): Promise<string> {
    const p = join(studio, "tmp", name);
    await mkdir(join(studio, "tmp"), { recursive: true });
    await writeFile(p, content);
    return p;
}

beforeEach(async () => {
    studio = await mkdtemp(join(tmpdir(), "dsh-tongflow-"));
    const created = await createProject(studio, {
        title: "Rooftop Rain",
        template: "manga-drama",
    });
    projectId = created.id;
    root = created.root;
});

afterEach(async () => {
    await rm(studio, { recursive: true, force: true });
});

describe("project model", () => {
    it("lists templates and creates a project from one", async () => {
        const templates = await listTemplates();
        expect(templates.map((t) => t.id)).toContain("manga-drama");
        expect(projectId).toBe("rooftop-rain");
        const ref = await loadProject(studio, projectId);
        expect(ref.manifest.title).toBe("Rooftop Rain");
        expect((await listProjects(studio)).map((p) => p.id)).toEqual([
            "rooftop-rain",
        ]);
        const again = await createProject(studio, {
            title: "Rooftop Rain",
            template: "manga-drama",
        });
        expect(again.id).toBe("rooftop-rain-2");
    });

    it("upserts bible entities and reads them back", async () => {
        await upsertEntity(root, {
            id: "CHR_MEI",
            card: "# Mei\n\nA quiet 17-year-old who paints on rooftops.\n",
            consistency: {
                seed: 42,
                promptPrefix: "anime style, Mei, short black hair",
            },
        });
        const list = await listEntities(root);
        expect(list.map((e) => e.id)).toEqual(["CHR_MEI", "STY_MAIN"]);
        expect(list[0]).toMatchObject({
            id: "CHR_MEI",
            kind: "character",
            name: "Mei",
        });
        const detail = await getEntity(root, "CHR_MEI");
        expect(detail?.consistency.seed).toBe(42);
        await upsertEntity(root, {
            id: "CHR_MEI",
            consistency: { seed: null, negativePrompt: "blurry" },
        });
        const after = await getEntity(root, "CHR_MEI");
        expect(after?.consistency).toEqual({
            promptPrefix: "anime style, Mei, short black hair",
            negativePrompt: "blurry",
        });
        await expect(upsertEntity(root, { id: "mei" })).rejects.toThrow(
            /invalid entity id/,
        );
    });

    it("writes a breakdown, assigns ids and scaffolds shot dirs", async () => {
        const bd = await writeBreakdown(studio, projectId, {
            episode: "EP01",
            scenes: [
                {
                    id: "",
                    location: "LOC_ROOFTOP",
                    shots: [
                        {
                            id: "",
                            size: "WS",
                            action: "Mei arrives",
                            characters: ["CHR_MEI"],
                            dialogue: [
                                {
                                    character: "CHR_MEI",
                                    line: "It's raining again.",
                                },
                            ],
                        },
                        {
                            id: "",
                            size: "CU",
                            action: "Mei looks up",
                            prompts: {
                                KF: "close-up of Mei looking up at the rain",
                            },
                        },
                    ],
                },
            ],
        });
        expect(bd.scenes[0].id).toBe("EP01_SC001");
        expect(bd.scenes[0].shots.map((s) => s.id)).toEqual([
            "EP01_SC001_SH0010",
            "EP01_SC001_SH0020",
        ]);
        expect(
            (await readBreakdown(root, "EP01"))?.scenes[0].shots[1].prompts?.KF,
        ).toContain("close-up");
        expect((await findShot(root, "EP01_SC001_SH0010"))?.shot.action).toBe(
            "Mei arrives",
        );
        const ref = await loadProject(studio, projectId);
        expect(ref.manifest.episodes).toEqual(["EP01"]);
        await expect(
            writeBreakdown(studio, projectId, {
                episode: "EP01",
                scenes: [{ id: "", shots: [{ id: "", characters: ["mei"] }] }],
            }),
        ).rejects.toThrow(/not an entity id/);
    });

    it("ingests takes, circles, resolves refs and deletes", async () => {
        await upsertEntity(root, { id: "CHR_MEI", card: "# Mei\n" });
        const t1 = await addTake(
            root,
            "CHR_MEI",
            "REF",
            await fixture("a.png"),
            { move: false },
        );
        const t2 = await addTake(
            root,
            "CHR_MEI",
            "REF",
            await fixture("b.png"),
            { move: false },
        );
        expect(t1.take).toBe("T01");
        expect(t2.take).toBe("T02");
        expect(t1.circled).toBe(true);
        expect(t2.circled).toBe(false);
        expect(t1.key).toBe("world/CHR_MEI/REF/CHR_MEI_REF_T01.png");

        let r = await resolveRef(root, "tf://CHR_MEI/REF");
        expect(r.kind === "files" && r.keys).toEqual([t1.key]);
        await circleTake(root, "CHR_MEI", "REF", "T02");
        r = await resolveRef(root, "tf://CHR_MEI/REF");
        expect(r.kind === "files" && r.keys).toEqual([t2.key]);
        r = await resolveRef(root, "tf://CHR_MEI/REF/T01");
        expect(r.kind === "files" && r.keys).toEqual([t1.key]);
        r = await resolveRef(root, "tf://CHR_MEI/REF/*");
        expect(r.kind === "files" && r.keys.length).toBe(2);
        r = await resolveRef(root, "tf://CHR_MEI/card");
        expect(r.kind === "texts" && r.texts[0]).toContain("# Mei");
        await expect(resolveRef(root, "tf://CHR_MEI/VO")).rejects.toThrow(
            /no VO take yet/,
        );
        await expect(resolveRef(root, "tf://CHR_MEI/REF/T09")).rejects.toThrow(
            /does not exist/,
        );

        await deleteTake(root, "CHR_MEI", "REF", "T02");
        const takes = await listTakes(root, "CHR_MEI", "REF");
        expect(takes.map((t) => [t.take, t.circled])).toEqual([["T01", true]]);
        expect((await resolveTake(root, "CHR_MEI", "REF"))?.take).toBe("T01");
    });

    it("collects shot passes across an episode in shooting order", async () => {
        await writeBreakdown(studio, projectId, {
            episode: "EP01",
            scenes: [
                { id: "", shots: [{ id: "" }, { id: "" }] },
                {
                    id: "",
                    shots: [
                        {
                            id: "",
                            dialogue: [
                                { character: "CHR_A", line: "one" },
                                { character: "CHR_B", line: "two" },
                            ],
                        },
                    ],
                },
            ],
        });
        await addTake(
            root,
            "EP01_SC002_SH0010",
            "ANI",
            await fixture("c.mp4"),
            { move: false },
        );
        await expect(resolveRef(root, "tf://EP01/ANI")).rejects.toThrow(
            /no ANI take yet for: EP01_SC001_SH0010, EP01_SC001_SH0020/,
        );
        await addTake(
            root,
            "EP01_SC001_SH0010",
            "ANI",
            await fixture("a.mp4"),
            { move: false },
        );
        await addTake(
            root,
            "EP01_SC001_SH0020",
            "ANI",
            await fixture("b.mp4"),
            { move: false },
        );
        const r = await resolveRef(root, "tf://EP01/ANI");
        expect(
            r.kind === "files" && r.keys.map((k) => k.split("/").pop()),
        ).toEqual([
            "EP01_SC001_SH0010_ANI_T01.mp4",
            "EP01_SC001_SH0020_ANI_T01.mp4",
            "EP01_SC002_SH0010_ANI_T01.mp4",
        ]);
        const d = await resolveRef(root, "tf://EP01_SC002_SH0010/dialogue");
        expect(d.kind === "texts" && d.texts).toEqual(["one", "two"]);
        const d2 = await resolveRef(root, "tf://EP01_SC002_SH0010/dialogue/2");
        expect(d2.kind === "texts" && d2.texts).toEqual(["two"]);
        const f = await resolveRef(root, "tf://file/story/script.md");
        expect(f.kind === "files" && f.paths[0]).toBe(
            fromProjectKey(root, "story/script.md"),
        );
    });
});

describe("templates", () => {
    it("expands {{tf://…}} placeholders inside text", async () => {
        const { expandTemplate, hasTemplateRefs } = await import(
            "../src/project/refs.ts"
        );
        await upsertEntity(root, {
            id: "CHR_MEI",
            card: "# Mei\n",
            consistency: { promptPrefix: "Mei, short black hair" },
        });
        expect(hasTemplateRefs("plain")).toBe(false);
        expect(hasTemplateRefs("{{tf://CHR_MEI/prompt}} x")).toBe(true);
        expect(hasTemplateRefs("{{tf://CHR_MEI/prompt}} x")).toBe(true); // regex lastIndex reset
        const out = await expandTemplate(
            root,
            "{{ tf://STY_MAIN/prompt }}, {{tf://CHR_MEI/prompt}}, full body",
        );
        expect(out).toBe(
            "anime style, clean line art, soft cel shading, cinematic composition, Mei, short black hair, full body",
        );
        await expect(
            expandTemplate(root, "{{tf://CHR_MEI/REF}}"),
        ).rejects.toThrow(/no REF take/);
    });
});

describe("template locales", () => {
    it("lists localized titles and overlays zh starter files", async () => {
        const zh = (await listTemplates("zh-CN")).find(
            (t) => t.id === "manga-drama",
        );
        expect(zh?.title).toBe("漫剧");
        expect(zh?.locales).toContain("zh");
        const en = (await listTemplates("en")).find(
            (t) => t.id === "manga-drama",
        );
        expect(en?.title).toContain("Manga drama");
        const created = await createProject(studio, {
            title: "中文项目",
            template: "manga-drama",
            locale: "zh-CN",
            logline: "一句话",
        });
        const readme = await import("node:fs/promises").then((fs) =>
            fs.readFile(`${created.root}/README.md`, "utf8"),
        );
        expect(readme).toContain("漫剧制作");
        expect(readme).toContain("中文项目");
        const { loadProject } = await import("../src/project/manifest.ts");
        expect(
            (await loadProject(studio, created.id)).manifest.defaults.locale,
        ).toBe("zh");
        const { stat } = await import("node:fs/promises");
        await expect(stat(`${created.root}/_locales`)).rejects.toThrow();
    });
});

describe("per-asset workflows", () => {
    it("infers the target from the file name and resolves templates under workflows/templates", async () => {
        const { targetFromWorkflowKey } = await import("../src/api.ts");
        expect(
            targetFromWorkflowKey(
                "workflows/EP01_SC001_SH0010_KF.tongflow.json",
            ),
        ).toEqual({ owner: "EP01_SC001_SH0010", pass: "KF" });
        expect(
            targetFromWorkflowKey("workflows/CHR_MEI_REF_wide.tongflow.json"),
        ).toEqual({ owner: "CHR_MEI", pass: "REF" });
        expect(
            targetFromWorkflowKey("workflows/EP01_CUT.tongflow.json"),
        ).toEqual({ owner: "EP01", pass: "CUT" });
        expect(
            targetFromWorkflowKey("workflows/character-sheet.tongflow.json"),
        ).toBeUndefined();
        expect(
            targetFromWorkflowKey("workflows/CHR_MEI_KF.tongflow.json"),
        ).toBeUndefined(); // KF is not an entity pass
        const { stat } = await import("node:fs/promises");
        await expect(
            stat(`${root}/workflows/templates/shot-keyframe.tongflow.json`),
        ).resolves.toBeTruthy();
    });
});

describe("legacy layout migration", () => {
    it("moves 01_DEV / 02_PREPRO / 03_PROD / 04_POST / 05_DELIVERY / dailies into the plain layout", async () => {
        const fs = await import("node:fs/promises");
        const legacy = join(studio, "projects", "legacy");
        await fs.mkdir(join(legacy, "02_PREPRO/bible/CHR_OLD/REF"), {
            recursive: true,
        });
        await fs.mkdir(join(legacy, "02_PREPRO/breakdown/EP01"), {
            recursive: true,
        });
        await fs.mkdir(join(legacy, "03_PROD/shots/EP01_SC001_SH0010/KF"), {
            recursive: true,
        });
        await fs.mkdir(join(legacy, "04_POST/EP01/CUT"), { recursive: true });
        await fs.mkdir(join(legacy, "01_DEV"), { recursive: true });
        await fs.mkdir(join(legacy, "dailies"), { recursive: true });
        await fs.writeFile(join(legacy, "01_DEV/script.md"), "# s");
        await fs.writeFile(
            join(legacy, "02_PREPRO/bible/CHR_OLD/card.md"),
            "# Old",
        );
        await fs.writeFile(
            join(legacy, "02_PREPRO/breakdown/EP01/scenes.json"),
            JSON.stringify({ episode: "EP01", scenes: [] }),
        );
        await fs.writeFile(
            join(legacy, "project.json"),
            JSON.stringify({
                id: "legacy",
                title: "L",
                template: "manga-drama",
                createdAt: "",
                updatedAt: "",
                naming: { shotStep: 10 },
                defaults: {},
                episodes: ["EP01"],
            }),
        );
        const ref = await loadProject(studio, "legacy");
        expect(ref.root).toBe(legacy);
        await expect(
            fs.stat(join(legacy, "world/CHR_OLD/card.md")),
        ).resolves.toBeTruthy();
        await expect(
            fs.stat(join(legacy, "episodes/EP01/scenes.json")),
        ).resolves.toBeTruthy();
        await expect(
            fs.stat(join(legacy, "episodes/EP01/CUT")),
        ).resolves.toBeTruthy();
        await expect(
            fs.stat(join(legacy, "shots/EP01_SC001_SH0010/KF")),
        ).resolves.toBeTruthy();
        await expect(
            fs.stat(join(legacy, "story/script.md")),
        ).resolves.toBeTruthy();
        await expect(fs.stat(join(legacy, "notes"))).resolves.toBeTruthy();
        await expect(fs.stat(join(legacy, "02_PREPRO"))).rejects.toThrow();
        expect((await listEntities(legacy)).map((e) => e.id)).toEqual([
            "CHR_OLD",
        ]);
    });
});
