/**
 * Shot breakdown: `episodes/<EP>/scenes.json` — the crew's
 * shooting script. Scenes → shots, each shot carrying the entities it uses,
 * its dialogue and the prompts the passes should render from.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
    EpisodeBreakdown,
    SceneBreakdown,
    ShotBreakdown,
} from "../shared/types.ts";
import { exists, readJsonOr, writeJson } from "../util/fsx.ts";
import { loadProject, saveManifest } from "./manifest.ts";
import {
    isEntityId,
    isEpisodeId,
    isSceneId,
    isShotId,
    parseShotId,
    SHOT_PASSES,
    sceneId,
    shotId,
} from "./naming.ts";
import { breakdownFile, projectPaths, shotDir } from "./paths.ts";
import { takeOverview } from "./takes.ts";

export async function readBreakdown(
    projectRoot: string,
    episode: string,
): Promise<EpisodeBreakdown | undefined> {
    if (!isEpisodeId(episode))
        throw new Error(`invalid episode id "${episode}"`);
    const path = breakdownFile(projectRoot, episode);
    return readJsonOr<EpisodeBreakdown | undefined>(path, undefined);
}

export async function listEpisodes(projectRoot: string): Promise<string[]> {
    const dir = projectPaths(projectRoot).breakdown;
    if (!(await exists(dir))) return [];
    return (await readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && isEpisodeId(e.name))
        .map((e) => e.name)
        .sort();
}

/**
 * Validate and persist an episode breakdown. Ids may be omitted on scenes /
 * shots — they are assigned sequentially (scene 001…, shots stepping by
 * `shotStep`). Existing ids are kept. Shot directories are created so the
 * production tree reflects the plan immediately.
 */
export async function writeBreakdown(
    studioRoot: string,
    projectId: string,
    input: EpisodeBreakdown,
    shotStep = 10,
): Promise<EpisodeBreakdown> {
    const ref = await loadProject(studioRoot, projectId);
    const episode = input.episode;
    if (!isEpisodeId(episode))
        throw new Error(
            `invalid episode id "${episode}" (expected EP01, EP02, …)`,
        );
    const normalized = normalizeBreakdown(input, shotStep);
    await validateEntityRefs(ref.root, normalized);
    await writeJson(breakdownFile(ref.root, episode), normalized);
    for (const scene of normalized.scenes) {
        for (const shot of scene.shots) {
            const dir = shotDir(ref.root, shot.id);
            await mkdir(dir, { recursive: true });
            for (const pass of SHOT_PASSES)
                await mkdir(join(dir, pass), { recursive: true });
        }
    }
    if (!ref.manifest.episodes.includes(episode)) {
        ref.manifest.episodes.push(episode);
        ref.manifest.episodes.sort();
        await saveManifest(ref.root, ref.manifest);
    }
    return normalized;
}

export function normalizeBreakdown(
    input: EpisodeBreakdown,
    shotStep: number,
): EpisodeBreakdown {
    const episode = input.episode;
    const scenes: SceneBreakdown[] = [];
    const seenScene = new Set<string>();
    input.scenes.forEach((scene, si) => {
        const id =
            scene.id && isSceneId(scene.id)
                ? scene.id
                : sceneId(episode, si + 1);
        if (!id.startsWith(`${episode}_`))
            throw new Error(`scene ${id} does not belong to ${episode}`);
        if (seenScene.has(id)) throw new Error(`duplicate scene id ${id}`);
        seenScene.add(id);
        const shots: ShotBreakdown[] = [];
        const seenShot = new Set<string>();
        scene.shots.forEach((shot, hi) => {
            const sid =
                shot.id && isShotId(shot.id)
                    ? shot.id
                    : shotId(id, (hi + 1) * shotStep);
            if (parseShotId(sid).scene !== id)
                throw new Error(`shot ${sid} does not belong to scene ${id}`);
            if (seenShot.has(sid)) throw new Error(`duplicate shot id ${sid}`);
            seenShot.add(sid);
            shots.push({ ...shot, id: sid });
        });
        scenes.push({ ...scene, id, shots });
    });
    return { ...input, episode, scenes };
}

async function validateEntityRefs(
    projectRoot: string,
    breakdown: EpisodeBreakdown,
): Promise<void> {
    const problems: string[] = [];
    const check = (where: string, ids: string[] | undefined) => {
        for (const id of ids ?? []) {
            if (!isEntityId(id))
                problems.push(`${where}: "${id}" is not an entity id`);
        }
    };
    for (const scene of breakdown.scenes) {
        check(scene.id, scene.characters);
        if (scene.location) check(scene.id, [scene.location]);
        for (const shot of scene.shots) {
            check(shot.id, shot.characters);
            check(shot.id, shot.props);
            for (const line of shot.dialogue ?? [])
                check(`${shot.id} dialogue`, [line.character]);
        }
    }
    if (problems.length > 0) throw new Error(problems.join("; "));
    // Existence is advisory (agents often plan shots before every entity has a card),
    // so we do not fail on unknown-but-well-formed ids here.
    void projectRoot;
}

/** Flat list of every shot in an episode in shooting order, with take overview. */
export interface ShotStatus {
    id: string;
    scene: string;
    breakdown: ShotBreakdown;
    circled: Partial<Record<(typeof SHOT_PASSES)[number], string>>;
    takeCounts: Partial<Record<(typeof SHOT_PASSES)[number], number>>;
}

export async function shotStatuses(
    projectRoot: string,
    episode: string,
): Promise<ShotStatus[]> {
    const bd = await readBreakdown(projectRoot, episode);
    if (!bd) return [];
    const out: ShotStatus[] = [];
    for (const scene of bd.scenes) {
        for (const shot of scene.shots) {
            const { counts, circled } = await takeOverview(
                projectRoot,
                shot.id,
                SHOT_PASSES,
            );
            out.push({
                id: shot.id,
                scene: scene.id,
                breakdown: shot,
                circled,
                takeCounts: counts,
            });
        }
    }
    return out;
}

/** Look up one shot's breakdown row across the project. */
export async function findShot(
    projectRoot: string,
    shot: string,
): Promise<
    | { episode: EpisodeBreakdown; scene: SceneBreakdown; shot: ShotBreakdown }
    | undefined
> {
    const parts = parseShotId(shot);
    const bd = await readBreakdown(projectRoot, parts.episode);
    if (!bd) return undefined;
    for (const scene of bd.scenes) {
        const s = scene.shots.find((x) => x.id === shot);
        if (s) return { episode: bd, scene, shot: s };
    }
    return undefined;
}
