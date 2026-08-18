/**
 * Data shapes shared by the host half and the browser half. Pure types +
 * tiny constants only — this file is compiled into both bundles.
 */

export type EntityKind = "character" | "location" | "prop" | "style";

export type Pass =
    | "REF"
    | "VO"
    | "SB"
    | "KF"
    | "ANI"
    | "DLG"
    | "MUS"
    | "SFX"
    | "MIX"
    | "CUT";

export type OwnerKind = "entity" | "shot" | "episode";

/** `project.json` at the project root. */
export interface ProjectManifest {
    id: string;
    title: string;
    template: string;
    createdAt: string;
    updatedAt: string;
    /** Free-form logline / synopsis shown in the project switcher. */
    logline?: string;
    naming: {
        /** Shot numbers step by this much (default 10) so shots can be inserted. */
        shotStep: number;
    };
    defaults: {
        locale?: string;
        /** Preferred plugin ids per ABI slot family, consulted by the skill. */
        plugins?: Record<string, string>;
    };
    episodes: string[];
}

/** `consistency.json` next to an entity's card — the consistency kit that follows the entity. */
export interface ConsistencyKit {
    /** Preferred plugin / model for generating this entity. */
    pluginId?: string;
    model?: string;
    seed?: number;
    /** Text prepended / appended to every prompt that renders this entity. */
    promptPrefix?: string;
    promptSuffix?: string;
    negativePrompt?: string;
    /** Project-relative keys of the reference images (usually circled REF takes). */
    refImages?: string[];
    /** Project-relative key of the voice reference (usually the circled VO take). */
    voiceRef?: string;
    lora?: Record<string, unknown>;
    notes?: string;
}

export interface EntitySummary {
    id: string;
    kind: EntityKind;
    name: string;
    /** First non-heading line of card.md. */
    summary?: string;
    circled: Partial<Record<Pass, string>>;
    takeCounts: Partial<Record<Pass, number>>;
}

export interface EntityDetail extends EntitySummary {
    card: string;
    consistency: ConsistencyKit;
}

/** One dialogue line inside a shot. */
export interface DialogueLine {
    character: string;
    line: string;
    /** Delivery / emotion note for the voice pass. */
    direction?: string;
}

export interface ShotBreakdown {
    id: string;
    /** Shot size: ECU, CU, MCU, MS, MLS, WS, EWS, POV, OTS, INSERT … */
    size?: string;
    /** Camera movement: static, pan, tilt, dolly, zoom, handheld … */
    camera?: string;
    /** Target duration in seconds. */
    duration?: number;
    characters?: string[];
    props?: string[];
    action?: string;
    dialogue?: DialogueLine[];
    /** Prompts the passes should use (agent-authored, entity refs by id). */
    prompts?: Partial<Record<"SB" | "KF" | "ANI", string>>;
    notes?: string;
}

export interface SceneBreakdown {
    id: string;
    title?: string;
    location?: string;
    timeOfDay?: string;
    summary?: string;
    characters?: string[];
    shots: ShotBreakdown[];
}

/** `02_PREPRO/breakdown/<EP>/scenes.json`. */
export interface EpisodeBreakdown {
    episode: string;
    title?: string;
    synopsis?: string;
    scenes: SceneBreakdown[];
}

/** `takes.json` inside an owner directory. */
export interface TakesManifest {
    circled: Partial<Record<Pass, string>>;
}

export interface TakeInfo {
    owner: string;
    pass: Pass;
    take: string;
    takeNo: number;
    ext: string;
    /** Project-relative key. */
    key: string;
    fileName: string;
    size: number;
    mtime: string;
    circled: boolean;
    provenance?: Provenance;
}

/** `<take>.provenance.json` — how a take came to be. */
export interface Provenance {
    runId: string;
    /** Project-relative key of the workflow file. */
    workflow: string;
    workflowHash: string;
    workflowName?: string;
    /** Input name → the `tf://` refs / literal values that were bound. */
    bindings: Record<string, string | string[]>;
    /** Input name → what the refs resolved to (project keys or text). */
    resolved: Record<string, string[]>;
    /** Which workflow output produced this take. */
    output: string;
    pluginIds: string[];
    sdkVersion?: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    /** Free-form note recorded when the take was made. */
    note?: string;
}

/** Studio-side metadata stored in a `.tongflow.json` file under `meta`. */
export interface WorkflowFileMeta {
    /** Default `tf://` bindings per workflow input name. */
    bindings?: Record<string, string | string[]>;
    /** Where the outputs of this workflow are ingested by default. */
    target?: { owner: string; pass: Pass };
    /** Template id this file was created from. */
    template?: string;
    /** Free-form purpose note. */
    purpose?: string;
}

export interface WorkflowSummary {
    key: string;
    name: string;
    description?: string;
    nodeCount: number;
    inputs: {
        name: string;
        type: string;
        required: boolean;
        bound?: string | string[];
    }[];
    outputs: { name: string; type: string }[];
    meta: WorkflowFileMeta;
    mtime: string;
}

export type RunStatus =
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

export interface RunEvent {
    type:
        | "log"
        | "workflow_started"
        | "node_started"
        | "plugin_progress"
        | "node_completed"
        | "node_failed"
        | "workflow_completed"
        | "workflow_failed"
        | "ingested"
        | "error";
    at: string;
    nodeId?: string;
    label?: string;
    feature?: string;
    level?: number;
    message?: string;
    percent?: number;
    error?: string;
    totalNodes?: number;
    levels?: number;
    takes?: TakeInfo[];
    /** Raw node outputs (nodeId → plugin output), on `ingested`. */
    outputs?: Record<string, unknown>;
}

export interface RunSummary {
    runId: string;
    projectId: string;
    workflow: string;
    target?: { owner: string; pass: Pass };
    status: RunStatus;
    startedAt: string;
    finishedAt?: string;
    error?: string;
    takes: TakeInfo[];
    /** Node id → last known state, for canvas overlays. */
    nodes: Record<
        string,
        {
            status: "running" | "completed" | "failed";
            label?: string;
            message?: string;
            percent?: number;
        }
    >;
}

export interface ProjectSummary extends ProjectManifest {
    root: string;
    entityCount: number;
    shotCount: number;
    workflowCount: number;
}

/** Tree node the studio's left pane renders. */
export interface TreeNode {
    id: string;
    label: string;
    kind:
        | "folder"
        | "file"
        | "entity"
        | "shot"
        | "episode"
        | "scene"
        | "workflow"
        | "take";
    key?: string;
    children?: TreeNode[];
    meta?: Record<string, unknown>;
}

export const MEDIA_EXT: Record<
    string,
    "image" | "video" | "audio" | "text" | "model" | "file"
> = {
    png: "image",
    jpg: "image",
    jpeg: "image",
    webp: "image",
    gif: "image",
    mp4: "video",
    mov: "video",
    webm: "video",
    mp3: "audio",
    wav: "audio",
    m4a: "audio",
    ogg: "audio",
    flac: "audio",
    md: "text",
    txt: "text",
    json: "text",
    srt: "text",
    glb: "model",
    gltf: "model",
    obj: "model",
    ply: "model",
    splat: "model",
};

export function modalityOfExt(
    ext: string,
): "image" | "video" | "audio" | "text" | "model" | "file" {
    return MEDIA_EXT[ext.toLowerCase().replace(/^\./, "")] ?? "file";
}
