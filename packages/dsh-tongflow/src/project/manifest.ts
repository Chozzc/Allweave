/** Project discovery and `project.json` handling. */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectManifest, ProjectSummary } from "../shared/types.ts";
import { exists, isDir, nowIso, readJson, writeJson } from "../util/fsx.ts";
import { isProjectId, projectIdFor } from "./naming.ts";
import { DIRS, PROJECT_MANIFEST, WORKFLOW_EXT, projectPaths, studioPaths } from "./paths.ts";

export class ProjectNotFoundError extends Error {
    constructor(readonly projectId: string) {
        super(`project "${projectId}" not found`);
        this.name = "ProjectNotFoundError";
    }
}

export interface ProjectRef {
    id: string;
    root: string;
    manifest: ProjectManifest;
}

export function projectRoot(studioRoot: string, projectId: string): string {
    if (!isProjectId(projectId)) throw new Error(`invalid project id "${projectId}"`);
    return join(studioPaths(studioRoot).projects, projectId);
}

export async function loadProject(studioRoot: string, projectId: string): Promise<ProjectRef> {
    const root = projectRoot(studioRoot, projectId);
    const manifestPath = join(root, PROJECT_MANIFEST);
    if (!(await exists(manifestPath))) throw new ProjectNotFoundError(projectId);
    const manifest = await readJson<ProjectManifest>(manifestPath);
    return { id: projectId, root, manifest };
}

export async function saveManifest(root: string, manifest: ProjectManifest): Promise<void> {
    manifest.updatedAt = nowIso();
    await writeJson(join(root, PROJECT_MANIFEST), manifest);
}

export async function listProjects(studioRoot: string): Promise<ProjectSummary[]> {
    const dir = studioPaths(studioRoot).projects;
    if (!(await isDir(dir))) return [];
    const names = (await readdir(dir)).filter(isProjectId).sort();
    const out: ProjectSummary[] = [];
    for (const id of names) {
        try {
            const ref = await loadProject(studioRoot, id);
            out.push(await summarize(ref));
        } catch {
            // A half-created or foreign directory: skip silently.
        }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
}

export async function summarize(ref: ProjectRef): Promise<ProjectSummary> {
    const p = projectPaths(ref.root);
    const [entities, shots, workflows] = await Promise.all([
        countDirs(p.bible),
        countDirs(p.shots),
        countFiles(p.workflows, WORKFLOW_EXT),
    ]);
    return {
        ...ref.manifest,
        root: ref.root,
        entityCount: entities,
        shotCount: shots,
        workflowCount: workflows,
    };
}

async function countDirs(dir: string): Promise<number> {
    if (!(await isDir(dir))) return 0;
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).length;
}

async function countFiles(dir: string, suffix: string): Promise<number> {
    if (!(await isDir(dir))) return 0;
    const entries = await readdir(dir);
    return entries.filter((n) => n.endsWith(suffix)).length;
}

/** Pick a free project id derived from the title. */
export async function allocateProjectId(studioRoot: string, title: string, preferred?: string): Promise<string> {
    const base = preferred && isProjectId(preferred) ? preferred : projectIdFor(title);
    const projects = studioPaths(studioRoot).projects;
    await mkdir(projects, { recursive: true });
    if (!(await exists(join(projects, base)))) return base;
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-${i}`;
        if (!(await exists(join(projects, candidate)))) return candidate;
    }
    throw new Error(`cannot allocate a project id for "${title}"`);
}

export function newManifest(id: string, title: string, template: string, logline?: string): ProjectManifest {
    const at = nowIso();
    return {
        id,
        title,
        template,
        createdAt: at,
        updatedAt: at,
        ...(logline ? { logline } : {}),
        naming: { shotStep: 10 },
        defaults: {},
        episodes: [],
    };
}

export { DIRS };
