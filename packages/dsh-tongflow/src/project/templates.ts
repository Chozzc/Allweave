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
import { PROJECT_MANIFEST, SCAFFOLD_DIRS, projectPaths, studioPaths } from "./paths.ts";

export interface TemplateInfo {
    id: string;
    title: string;
    description: string;
    /** Skill names this template relies on (registered by the plugin). */
    skills?: string[];
    dir: string;
}

interface TemplateManifest {
    title: string;
    description: string;
    skills?: string[];
}

async function resolveTemplatesRoot(): Promise<string> {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [join(here, "..", "templates"), join(here, "..", "..", "templates")]) {
        if (await isDir(candidate)) return candidate;
    }
    throw new Error("dsh-tongflow: templates directory not found next to the package");
}

export async function listTemplates(): Promise<TemplateInfo[]> {
    const root = await resolveTemplatesRoot();
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
        out.push({ id, title: m.title, description: m.description, ...(m.skills ? { skills: m.skills } : {}), dir });
    }
    return out;
}

export async function getTemplate(id: string): Promise<TemplateInfo> {
    const found = (await listTemplates()).find((t) => t.id === id);
    if (!found) throw new Error(`unknown template "${id}"; available: ${(await listTemplates()).map((t) => t.id).join(", ")}`);
    return found;
}

export interface CreateProjectInput {
    title: string;
    template: string;
    logline?: string;
    /** Preferred kebab-case id; a numeric suffix is appended when taken. */
    id?: string;
}

/** Scaffold a new project directory and return its id + root. */
export async function createProject(
    studioRoot: string,
    input: CreateProjectInput,
): Promise<{ id: string; root: string }> {
    const template = await getTemplate(input.template);
    const id = await allocateProjectId(studioRoot, input.title, input.id);
    const root = join(studioPaths(studioRoot).projects, id);
    await mkdir(root, { recursive: true });
    for (const rel of SCAFFOLD_DIRS) await mkdir(join(root, rel), { recursive: true });
    // Copy the template tree (everything except template.json).
    for (const entry of await readdir(template.dir, { withFileTypes: true })) {
        if (entry.name === "template.json") continue;
        await cp(join(template.dir, entry.name), join(root, entry.name), { recursive: true, force: false });
    }
    // Substitute placeholders in text starters (README etc.).
    await substitutePlaceholders(root, { title: input.title, id, logline: input.logline ?? "" });
    const manifest = newManifest(id, input.title, input.template, input.logline);
    await saveManifest(root, manifest);
    return { id, root };
}

async function substitutePlaceholders(root: string, vars: Record<string, string>): Promise<void> {
    const p = projectPaths(root);
    for (const file of [join(root, "README.md"), join(p.dev, "outline.md"), join(p.dev, "script.md")]) {
        if (!(await exists(file))) continue;
        let text = await readFile(file, "utf8");
        for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
        await writeFileAtomic(file, text);
    }
}

export { PROJECT_MANIFEST };
