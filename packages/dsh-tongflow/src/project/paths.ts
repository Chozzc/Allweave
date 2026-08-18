/**
 * Where things live — studio root, project directories and the per-owner
 * pass folders. Everything derives from a project root and the naming rules.
 */
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
    assertPassForOwner,
    isEntityId,
    isEpisodeId,
    isShotId,
    ownerKindOf,
    type Pass,
} from "./naming.ts";

/** `$DSH_HOME`, else `~/.dsh` (mirrors dsh's own resolution). */
export function resolveDshHome(): string {
    const env = process.env.DSH_HOME;
    return env?.trim() ? resolve(env) : join(homedir(), ".dsh");
}

/** Studio data root: `<DSH_HOME>/tongflow` unless overridden. */
export function resolveStudioRoot(configured?: string): string {
    return configured?.trim()
        ? resolve(configured)
        : join(resolveDshHome(), "tongflow");
}

export interface StudioPaths {
    root: string;
    projects: string;
    /** Bootstrap venv holding the `tongflow` SDK used to launch the engine. */
    venv: string;
    /** Engine `plugins_dir` (cloned TongFlow plugins). */
    plugins: string;
    /** Engine `data_dir` (shared plugin venv, caches). */
    data: string;
    tmp: string;
}

export function studioPaths(root: string): StudioPaths {
    return {
        root,
        projects: join(root, "projects"),
        venv: join(root, "venv"),
        plugins: join(root, "plugins"),
        data: join(root, "data"),
        tmp: join(root, "tmp"),
    };
}

/* ------------------------------------------------------------------ */
/* Project layout                                                      */
/* ------------------------------------------------------------------ */

export const PROJECT_MANIFEST = "project.json";
export const TAKES_MANIFEST = "takes.json";
export const CONSISTENCY_FILE = "consistency.json";
export const CARD_FILE = "card.md";
export const SCENES_FILE = "scenes.json";
export const WORKFLOW_EXT = ".tongflow.json";

/**
 * On-disk layout — plain words, stable across UI languages (the UI shows
 * localized labels; agents and workflows rely on these names).
 *
 *   story/        treatment, outline, script
 *   world/        CHR_ / LOC_ / PRP_ / STY_ entities (card, consistency kit, REF/, VO/)
 *   episodes/EP01 scenes.json (shot breakdown) + MUS/ SFX/ MIX/ CUT/
 *   shots/<SHOT>  SB/ KF/ ANI/ DLG/
 *   inbox/        user drops · workflows/ · notes/ (review notes) · export/ (deliverables)
 */
export const DIRS = {
    dev: "story",
    bible: "world",
    breakdown: "episodes",
    inbox: "inbox",
    shots: "shots",
    post: "episodes",
    delivery: "export",
    workflows: "workflows",
    dailies: "notes",
    runs: ".runs",
} as const;

export const SCAFFOLD_DIRS: readonly string[] = [
    DIRS.dev,
    DIRS.bible,
    DIRS.breakdown,
    DIRS.inbox,
    DIRS.shots,
    DIRS.post,
    DIRS.delivery,
    DIRS.workflows,
    DIRS.dailies,
];

export interface ProjectPaths {
    root: string;
    manifest: string;
    dev: string;
    bible: string;
    breakdown: string;
    inbox: string;
    shots: string;
    post: string;
    delivery: string;
    workflows: string;
    dailies: string;
    runs: string;
}

export function projectPaths(root: string): ProjectPaths {
    return {
        root,
        manifest: join(root, PROJECT_MANIFEST),
        dev: join(root, DIRS.dev),
        bible: join(root, DIRS.bible),
        breakdown: join(root, DIRS.breakdown),
        inbox: join(root, DIRS.inbox),
        shots: join(root, DIRS.shots),
        post: join(root, DIRS.post),
        delivery: join(root, DIRS.delivery),
        workflows: join(root, DIRS.workflows),
        dailies: join(root, DIRS.dailies),
        runs: join(root, DIRS.runs),
    };
}

/** Directory of an owner (entity → world/<id>, shot → shots/<id>, episode → episodes/<EP>). */
export function ownerDir(projectRoot: string, owner: string): string {
    const kind = ownerKindOf(owner);
    switch (kind) {
        case "entity":
            return join(projectRoot, DIRS.bible, owner);
        case "shot":
            return join(projectRoot, DIRS.shots, owner);
        case "episode":
            return join(projectRoot, DIRS.post, owner);
    }
}

/** Folder holding the takes of one pass for one owner. */
export function passDir(
    projectRoot: string,
    owner: string,
    pass: Pass,
): string {
    assertPassForOwner(owner, pass);
    return join(ownerDir(projectRoot, owner), pass);
}

export function entityDir(projectRoot: string, entityId: string): string {
    if (!isEntityId(entityId))
        throw new Error(`invalid entity id "${entityId}"`);
    return join(projectRoot, DIRS.bible, entityId);
}

export function shotDir(projectRoot: string, shot: string): string {
    if (!isShotId(shot)) throw new Error(`invalid shot id "${shot}"`);
    return join(projectRoot, DIRS.shots, shot);
}

export function breakdownFile(projectRoot: string, episode: string): string {
    if (!isEpisodeId(episode))
        throw new Error(`invalid episode id "${episode}"`);
    return join(projectRoot, DIRS.breakdown, episode, SCENES_FILE);
}

/** POSIX-style path relative to the project root (the file-key form used in workflows and URLs). */
export function toProjectKey(projectRoot: string, absPath: string): string {
    const rel = relative(projectRoot, absPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`path escapes the project: ${absPath}`);
    }
    return rel.split(sep).join("/");
}

/** Resolve a project-relative key to an absolute path, refusing escapes. */
export function fromProjectKey(projectRoot: string, key: string): string {
    const abs = resolve(projectRoot, key);
    const rel = relative(projectRoot, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`key escapes the project: ${key}`);
    }
    return abs;
}

export function isInsideProject(projectRoot: string, absPath: string): boolean {
    const rel = relative(projectRoot, absPath);
    return !(rel.startsWith("..") || isAbsolute(rel));
}
