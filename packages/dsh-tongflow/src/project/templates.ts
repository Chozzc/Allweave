/**
 * Project templates: a folder scaffold + starter files + workflow templates,
 * shipped under `<package>/templates/<id>/`. Creating a project copies the
 * template tree over the standard crew layout and writes project.json.
 */
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exists, isDir, readJson, writeFileAtomic } from "../util/fsx.ts";
import { allocateProjectId, newManifest, saveManifest } from "./manifest.ts";
import {
    PROJECT_MANIFEST,
    projectPaths,
    SCAFFOLD_DIRS,
    studioPaths,
} from "./paths.ts";

export interface TemplateInfo {
    id: string;
    title: string;
    description: string;
    /** Skill names this template relies on (registered by the plugin). */
    skills?: string[];
    dir: string;
    /** Locales that ship an overlay under `_locales/<lang>/`. */
    locales: string[];
}

interface TemplateManifest {
    title: string;
    description: string;
    skills?: string[];
    /** Localized title/description by language (`zh`, `ja`, …). */
    locales?: Record<string, { title?: string; description?: string }>;
}

const LOCALES_DIR = "_locales";

/** `zh-CN` → `zh`; anything unknown → `en`. */
export function templateLang(locale: string | undefined): string {
    return (locale ?? "en").toLowerCase().split(/[-_]/)[0] || "en";
}

async function resolveTemplatesRoot(): Promise<string> {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
        join(here, "..", "templates"),
        join(here, "..", "..", "templates"),
    ]) {
        if (await isDir(candidate)) return candidate;
    }
    throw new Error(
        "dsh-tongflow: templates directory not found next to the package",
    );
}

export async function listTemplates(locale?: string): Promise<TemplateInfo[]> {
    const root = await resolveTemplatesRoot();
    const lang = templateLang(locale);
    const names = (await readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    const out: TemplateInfo[] = [];
    for (const id of names) {
        const dir = join(root, id);
        const manifestPath = join(dir, "template.json");
        if (!(await exists(manifestPath))) continue;
        const m = await readJson<TemplateManifest>(manifestPath);
        const localesDir = join(dir, LOCALES_DIR);
        const locales = (await isDir(localesDir))
            ? (await readdir(localesDir, { withFileTypes: true }))
                  .filter((e) => e.isDirectory())
                  .map((e) => e.name)
            : [];
        const loc = m.locales?.[lang];
        out.push({
            id,
            title: loc?.title ?? m.title,
            description: loc?.description ?? m.description,
            ...(m.skills ? { skills: m.skills } : {}),
            dir,
            locales,
        });
    }
    return out;
}

export async function getTemplate(
    id: string,
    locale?: string,
): Promise<TemplateInfo> {
    const found = (await listTemplates(locale)).find((t) => t.id === id);
    if (!found)
        throw new Error(
            `unknown template "${id}"; available: ${(await listTemplates()).map((t) => t.id).join(", ")}`,
        );
    return found;
}

export interface CreateProjectInput {
    title: string;
    template: string;
    logline?: string;
    /** Preferred kebab-case id; a numeric suffix is appended when taken. */
    id?: string;
    /** UI locale (`zh-CN`, `en`, …): picks the template's `_locales/<lang>/` overlay for starter files. */
    locale?: string;
}

/** Scaffold a new project directory and return its id + root. */
export async function createProject(
    studioRoot: string,
    input: CreateProjectInput,
): Promise<{ id: string; root: string }> {
    const template = await getTemplate(input.template, input.locale);
    const lang = templateLang(input.locale);
    const id = await allocateProjectId(studioRoot, input.title, input.id);
    const root = join(studioPaths(studioRoot).projects, id);
    await mkdir(root, { recursive: true });
    for (const rel of SCAFFOLD_DIRS)
        await mkdir(join(root, rel), { recursive: true });
    // Copy the template tree (everything except template.json and locale overlays).
    for (const entry of await readdir(template.dir, { withFileTypes: true })) {
        if (entry.name === "template.json" || entry.name === LOCALES_DIR)
            continue;
        await cp(join(template.dir, entry.name), join(root, entry.name), {
            recursive: true,
            force: false,
        });
    }
    // Then the locale overlay (same tree, translated starter files) on top.
    const overlay = join(template.dir, LOCALES_DIR, lang);
    if (lang !== "en" && (await isDir(overlay))) {
        for (const entry of await readdir(overlay, { withFileTypes: true })) {
            await cp(join(overlay, entry.name), join(root, entry.name), {
                recursive: true,
                force: true,
            });
        }
    }
    // Substitute placeholders in text starters (README etc.).
    await substitutePlaceholders(root, {
        title: input.title,
        id,
        logline: input.logline ?? "",
    });
    const manifest = newManifest(
        id,
        input.title,
        input.template,
        input.logline,
    );
    manifest.defaults.locale = lang;
    await saveManifest(root, manifest);
    return { id, root };
}

async function substitutePlaceholders(
    root: string,
    vars: Record<string, string>,
): Promise<void> {
    const p = projectPaths(root);
    for (const file of [
        join(root, "README.md"),
        join(p.dev, "outline.md"),
        join(p.dev, "script.md"),
    ]) {
        if (!(await exists(file))) continue;
        let text = await readFile(file, "utf8");
        for (const [k, v] of Object.entries(vars))
            text = text.replaceAll(`{{${k}}}`, v);
        await writeFileAtomic(file, text);
    }
}

export { PROJECT_MANIFEST };
