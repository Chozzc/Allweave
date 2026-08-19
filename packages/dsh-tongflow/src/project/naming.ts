/**
 * Film-crew naming conventions — the single source of truth for every id,
 * file name and directory the studio produces.
 *
 *  - Episode / scene / shot:  EP01  ·  EP01_SC003  ·  EP01_SC003_SH0010
 *    (shot numbers step by 10 so a shot can be inserted between two others)
 *  - Bible entities:          CHR_MEI · LOC_ROOFTOP · PRP_UMBRELLA · STY_MAIN
 *  - Passes (departments):    REF VO · SB KF ANI DLG · MUS SFX MIX CUT
 *  - Takes:                   T01 … T99, file `<owner>_<PASS>_T02.png`,
 *                             sidecar `<owner>_<PASS>_T02.provenance.json`
 */

export const ENTITY_KINDS = {
    CHR: "character",
    LOC: "location",
    PRP: "prop",
    STY: "style",
} as const;

export type EntityPrefix = keyof typeof ENTITY_KINDS;
export type EntityKind = (typeof ENTITY_KINDS)[EntityPrefix];

/** Passes owned by a bible entity. */
export const ENTITY_PASSES = ["REF", "VO"] as const;
/** Passes owned by a shot. */
export const SHOT_PASSES = ["SB", "KF", "ANI", "DLG"] as const;
/** Passes owned by an episode (post-production). */
export const EPISODE_PASSES = ["MUS", "SFX", "MIX", "CUT"] as const;

export const PASSES = [
    ...ENTITY_PASSES,
    ...SHOT_PASSES,
    ...EPISODE_PASSES,
] as const;
export type Pass = (typeof PASSES)[number];

export const PASS_LABELS: Record<Pass, string> = {
    REF: "reference image",
    VO: "voice reference",
    SB: "storyboard panel",
    KF: "keyframe / shot still",
    ANI: "animation (image-to-video)",
    DLG: "dialogue (voice-over)",
    MUS: "music",
    SFX: "sound effects",
    MIX: "audio mix",
    CUT: "edit / assembled cut",
};

export type OwnerKind = "entity" | "shot" | "episode";

const EPISODE_RE = /^EP(\d{2})$/;
const SCENE_RE = /^EP(\d{2})_SC(\d{3})$/;
const SHOT_RE = /^EP(\d{2})_SC(\d{3})_SH(\d{4})$/;
const ENTITY_RE = /^(CHR|LOC|PRP|STY)_[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const TAKE_RE = /^T(\d{2})$/;
const PROJECT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isEpisodeId(id: string): boolean {
    return EPISODE_RE.test(id);
}
export function isSceneId(id: string): boolean {
    return SCENE_RE.test(id);
}
export function isShotId(id: string): boolean {
    return SHOT_RE.test(id);
}
export function isEntityId(id: string): boolean {
    return ENTITY_RE.test(id);
}
export function isTakeId(id: string): boolean {
    return TAKE_RE.test(id);
}
export function isPass(value: string): value is Pass {
    return (PASSES as readonly string[]).includes(value);
}
export function isProjectId(id: string): boolean {
    return PROJECT_ID_RE.test(id);
}

export function episodeId(n: number): string {
    return `EP${String(n).padStart(2, "0")}`;
}
export function sceneId(episode: string, n: number): string {
    assertEpisode(episode);
    return `${episode}_SC${String(n).padStart(3, "0")}`;
}
export function shotId(scene: string, n: number): string {
    if (!isSceneId(scene)) throw new Error(`invalid scene id "${scene}"`);
    return `${scene}_SH${String(n).padStart(4, "0")}`;
}
export function takeId(n: number): string {
    if (n < 1 || n > 99) throw new Error(`take number out of range: ${n}`);
    return `T${String(n).padStart(2, "0")}`;
}
export function takeNumber(take: string): number {
    const m = TAKE_RE.exec(take);
    if (!m) throw new Error(`invalid take id "${take}"`);
    return Number(m[1]);
}

export function entityKindOf(id: string): EntityKind {
    const m = ENTITY_RE.exec(id);
    if (!m) throw new Error(`invalid entity id "${id}"`);
    return ENTITY_KINDS[m[1] as EntityPrefix];
}

/** Build an entity id from a kind and a free-form name ("Mei Lin" → CHR_MEI_LIN). */
export function entityIdFor(
    kind: EntityKind | EntityPrefix,
    name: string,
): string {
    const prefix = (Object.keys(ENTITY_KINDS) as EntityPrefix[]).find(
        (p) => p === kind || ENTITY_KINDS[p] === kind,
    );
    if (!prefix) throw new Error(`unknown entity kind "${kind}"`);
    const slug = name
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
    if (!slug) throw new Error(`cannot derive an entity id from "${name}"`);
    return `${prefix}_${slug}`;
}

export interface ShotParts {
    episode: string;
    scene: string;
    episodeNo: number;
    sceneNo: number;
    shotNo: number;
}

export function parseShotId(id: string): ShotParts {
    const m = SHOT_RE.exec(id);
    if (!m) throw new Error(`invalid shot id "${id}"`);
    return {
        episode: `EP${m[1]}`,
        scene: `EP${m[1]}_SC${m[2]}`,
        episodeNo: Number(m[1]),
        sceneNo: Number(m[2]),
        shotNo: Number(m[3]),
    };
}

export function episodeOfScene(scene: string): string {
    const m = SCENE_RE.exec(scene);
    if (!m) throw new Error(`invalid scene id "${scene}"`);
    return `EP${m[1]}`;
}

function assertEpisode(id: string): void {
    if (!isEpisodeId(id)) throw new Error(`invalid episode id "${id}"`);
}

/** Classify an owner id (entity / shot / episode) or throw. */
export function ownerKindOf(id: string): OwnerKind {
    if (isEntityId(id)) return "entity";
    if (isShotId(id)) return "shot";
    if (isEpisodeId(id)) return "episode";
    throw new Error(
        `"${id}" is not an entity (CHR_/LOC_/PRP_/STY_…), shot (EP01_SC003_SH0010) or episode (EP01) id`,
    );
}

/** Passes an owner kind may hold. */
export function passesFor(kind: OwnerKind): readonly Pass[] {
    switch (kind) {
        case "entity":
            return ENTITY_PASSES;
        case "shot":
            return SHOT_PASSES;
        case "episode":
            return EPISODE_PASSES;
    }
}

export function assertPassForOwner(owner: string, pass: Pass): OwnerKind {
    const kind = ownerKindOf(owner);
    if (!(passesFor(kind) as readonly string[]).includes(pass)) {
        throw new Error(
            `pass ${pass} does not belong to a ${kind} (${owner}); allowed: ${passesFor(kind).join(", ")}`,
        );
    }
    return kind;
}

/** Sort key so shots order by episode → scene → shot number. */
export function shotSortKey(id: string): number {
    const p = parseShotId(id);
    return p.episodeNo * 1e8 + p.sceneNo * 1e4 + p.shotNo;
}

/* ------------------------------------------------------------------ */
/* Take file names                                                     */
/* ------------------------------------------------------------------ */

export interface TakeFileParts {
    owner: string;
    pass: Pass;
    take: string;
    takeNo: number;
    ext: string;
}

const TAKE_FILE_RE =
    /^(?<owner>(?:CHR|LOC|PRP|STY)_[A-Z0-9]+(?:_[A-Z0-9]+)*|EP\d{2}_SC\d{3}_SH\d{4}|EP\d{2})_(?<pass>[A-Z]+)_(?<take>T\d{2})\.(?<ext>[A-Za-z0-9]+)$/;

export function takeFileName(
    owner: string,
    pass: Pass,
    take: string,
    ext: string,
): string {
    if (!isTakeId(take)) throw new Error(`invalid take id "${take}"`);
    const cleanExt = ext.replace(/^\./, "").toLowerCase();
    if (!cleanExt) throw new Error("take file extension is required");
    return `${owner}_${pass}_${take}.${cleanExt}`;
}

export function provenanceFileName(
    owner: string,
    pass: Pass,
    take: string,
): string {
    return `${owner}_${pass}_${take}.provenance.json`;
}

/** Parse a take file name; returns undefined for sidecars and foreign files. */
export function parseTakeFileName(name: string): TakeFileParts | undefined {
    if (name.endsWith(".provenance.json")) return undefined;
    const m = TAKE_FILE_RE.exec(name);
    if (!m?.groups) return undefined;
    const pass = m.groups.pass;
    if (!isPass(pass)) return undefined;
    return {
        owner: m.groups.owner,
        pass,
        take: m.groups.take,
        takeNo: takeNumber(m.groups.take),
        ext: m.groups.ext.toLowerCase(),
    };
}

/** Kebab-case project id from a free-form title ("我的漫剧 Demo!" → "demo" / fallback). */
export function projectIdFor(title: string, fallback = "project"): string {
    const slug = title
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}
