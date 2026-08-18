/**
 * `tf://` asset references — how workflows, tools and the canvas point at
 * project assets by role instead of by path, so the bible stays the single
 * source of consistency.
 *
 *   tf://CHR_MEI/REF              circled reference image of CHR_MEI
 *   tf://CHR_MEI/REF/T02          a specific take
 *   tf://CHR_MEI/REF/*            every REF take
 *   tf://CHR_MEI/VO               circled voice reference
 *   tf://EP01_SC003_SH0010/KF     circled keyframe of a shot
 *   tf://EP01/ANI                 circled ANI take of every shot in EP01 (shooting order)
 *   tf://EP01_SC003/DLG           same, scoped to a scene
 *   tf://EP01/CUT                 circled cut of the episode
 *
 *   tf://EP01_SC003_SH0010/dialogue      all dialogue lines (one text each)
 *   tf://EP01_SC003_SH0010/dialogue/2    the second line
 *   tf://EP01_SC003_SH0010/prompt/KF     the KF prompt from the breakdown
 *   tf://EP01_SC003_SH0010/action        the action description
 *   tf://CHR_MEI/card                    card.md text
 *   tf://CHR_MEI/prompt                  promptPrefix from the consistency kit
 *   tf://CHR_MEI/negative                negativePrompt from the consistency kit
 *   tf://file/<project-relative-path>    any file inside the project
 *   tf://text/<project-relative-path>    any text file inside the project, as text
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConsistencyKit, Pass } from "../shared/types.ts";
import { readJsonOr } from "../util/fsx.ts";
import { findShot, readBreakdown } from "./breakdown.ts";
import {
    SHOT_PASSES,
    isEntityId,
    isEpisodeId,
    isPass,
    isSceneId,
    isShotId,
    isTakeId,
    ownerKindOf,
    passesFor,
    shotSortKey,
} from "./naming.ts";
import { CARD_FILE, CONSISTENCY_FILE, entityDir, fromProjectKey, toProjectKey } from "./paths.ts";
import { listTakes, resolveTake } from "./takes.ts";

export const TF_SCHEME = "tf://";

export function isTfRef(value: unknown): value is string {
    return typeof value === "string" && value.startsWith(TF_SCHEME);
}

const TEMPLATE_RE = /\{\{\s*(tf:\/\/[^}\s]+)\s*\}\}/g;

/** True when a string embeds `{{tf://…}}` placeholders. */
export function hasTemplateRefs(value: unknown): value is string {
    return typeof value === "string" && TEMPLATE_RE.test(value) && ((TEMPLATE_RE.lastIndex = 0), true);
}

/**
 * Expand `{{tf://…}}` placeholders inside a string: text refs are joined with
 * a space, file refs become their project keys. Lets one prompt compose the
 * style prefix, a character prefix and shot-specific text:
 *   "{{tf://STY_MAIN/prompt}}, {{tf://CHR_MEI/prompt}}, full-body reference sheet"
 */
export async function expandTemplate(projectRoot: string, text: string): Promise<string> {
    const matches = [...text.matchAll(TEMPLATE_RE)];
    if (matches.length === 0) return text;
    let out = "";
    let last = 0;
    for (const m of matches) {
        out += text.slice(last, m.index);
        const r = await resolveRef(projectRoot, m[1]);
        out += r.kind === "texts" ? r.texts.join(" ") : r.keys.join(" ");
        last = (m.index ?? 0) + m[0].length;
    }
    return out + text.slice(last);
}

export type ResolvedRef =
    | { kind: "files"; ref: string; paths: string[]; keys: string[] }
    | { kind: "texts"; ref: string; texts: string[] };

export class RefResolutionError extends Error {
    constructor(
        readonly ref: string,
        detail: string,
    ) {
        super(`cannot resolve ${ref}: ${detail}`);
        this.name = "RefResolutionError";
    }
}

export async function resolveRef(projectRoot: string, ref: string): Promise<ResolvedRef> {
    if (!isTfRef(ref)) throw new RefResolutionError(ref, "not a tf:// reference");
    const body = ref.slice(TF_SCHEME.length);
    const segments = body.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) throw new RefResolutionError(ref, "empty reference");
    const [head, ...rest] = segments;

    if (head === "file" || head === "text") {
        const key = rest.join("/");
        if (!key) throw new RefResolutionError(ref, "missing path");
        const abs = fromProjectKey(projectRoot, key);
        if (head === "file") return { kind: "files", ref, paths: [abs], keys: [key] };
        return { kind: "texts", ref, texts: [await readFile(abs, "utf8")] };
    }

    // Entity-owned
    if (isEntityId(head)) return resolveEntityRef(projectRoot, ref, head, rest);
    // Shot-owned
    if (isShotId(head)) return resolveShotRef(projectRoot, ref, head, rest);
    // Episode / scene collections and episode passes
    if (isEpisodeId(head) || isSceneId(head)) return resolveSequenceRef(projectRoot, ref, head, rest);

    throw new RefResolutionError(ref, `unknown owner "${head}"`);
}

async function resolveEntityRef(projectRoot: string, ref: string, entity: string, rest: string[]): Promise<ResolvedRef> {
    const [what, arg] = rest;
    if (!what) throw new RefResolutionError(ref, "expected /REF, /VO, /card, /prompt or /negative");
    if (isPass(what)) return resolvePassRef(projectRoot, ref, entity, what, arg);
    const dir = entityDir(projectRoot, entity);
    if (what === "card") return { kind: "texts", ref, texts: [await readFile(join(dir, CARD_FILE), "utf8")] };
    const kit = await readJsonOr<ConsistencyKit>(join(dir, CONSISTENCY_FILE), {});
    if (what === "prompt") return { kind: "texts", ref, texts: [kit.promptPrefix ?? ""] };
    if (what === "suffix") return { kind: "texts", ref, texts: [kit.promptSuffix ?? ""] };
    if (what === "negative") return { kind: "texts", ref, texts: [kit.negativePrompt ?? ""] };
    throw new RefResolutionError(ref, `unknown entity field "${what}"`);
}

async function resolveShotRef(projectRoot: string, ref: string, shot: string, rest: string[]): Promise<ResolvedRef> {
    const [what, arg] = rest;
    if (!what) throw new RefResolutionError(ref, "expected /SB, /KF, /ANI, /DLG, /dialogue, /prompt/<PASS> or /action");
    if (isPass(what)) return resolvePassRef(projectRoot, ref, shot, what, arg);
    const found = await findShot(projectRoot, shot);
    if (!found) throw new RefResolutionError(ref, `shot ${shot} is not in the breakdown`);
    const row = found.shot;
    switch (what) {
        case "dialogue": {
            const lines = (row.dialogue ?? []).map((l) => l.line);
            if (arg !== undefined) {
                const n = Number(arg);
                if (!Number.isInteger(n) || n < 1 || n > lines.length) {
                    throw new RefResolutionError(ref, `dialogue line ${arg} out of range (1..${lines.length})`);
                }
                return { kind: "texts", ref, texts: [lines[n - 1]] };
            }
            return { kind: "texts", ref, texts: lines };
        }
        case "prompt": {
            const pass = (arg ?? "").toUpperCase() as "SB" | "KF" | "ANI";
            const text = row.prompts?.[pass];
            if (text === undefined) throw new RefResolutionError(ref, `shot ${shot} has no ${pass || "?"} prompt`);
            return { kind: "texts", ref, texts: [text] };
        }
        case "action":
            return { kind: "texts", ref, texts: [row.action ?? ""] };
        default:
            throw new RefResolutionError(ref, `unknown shot field "${what}"`);
    }
}

async function resolveSequenceRef(projectRoot: string, ref: string, seq: string, rest: string[]): Promise<ResolvedRef> {
    const [what, arg] = rest;
    if (!what) throw new RefResolutionError(ref, "expected a pass (e.g. /ANI, /CUT)");
    if (!isPass(what)) throw new RefResolutionError(ref, `unknown field "${what}"`);
    // Episode-owned pass (MUS/SFX/MIX/CUT) → its own takes.
    if (isEpisodeId(seq) && (passesFor("episode") as readonly string[]).includes(what)) {
        return resolvePassRef(projectRoot, ref, seq, what, arg);
    }
    // Shot pass across a sequence → circled take of every shot, in order.
    if (!(SHOT_PASSES as readonly string[]).includes(what)) {
        throw new RefResolutionError(ref, `pass ${what} cannot be collected across ${seq}`);
    }
    const episode = isEpisodeId(seq) ? seq : seq.slice(0, 4);
    const bd = await readBreakdown(projectRoot, episode);
    if (!bd) throw new RefResolutionError(ref, `no breakdown for ${episode}`);
    const shots = bd.scenes
        .filter((s) => isEpisodeId(seq) || s.id === seq)
        .flatMap((s) => s.shots.map((h) => h.id))
        .sort((a, b) => shotSortKey(a) - shotSortKey(b));
    const paths: string[] = [];
    const keys: string[] = [];
    const missing: string[] = [];
    for (const shot of shots) {
        const take = await resolveTake(projectRoot, shot, what as Pass);
        if (!take) {
            missing.push(shot);
            continue;
        }
        paths.push(fromProjectKey(projectRoot, take.key));
        keys.push(take.key);
    }
    if (missing.length > 0) {
        throw new RefResolutionError(ref, `no ${what} take yet for: ${missing.join(", ")}`);
    }
    return { kind: "files", ref, paths, keys };
}

async function resolvePassRef(
    projectRoot: string,
    ref: string,
    owner: string,
    pass: Pass,
    arg: string | undefined,
): Promise<ResolvedRef> {
    ownerKindOf(owner);
    if (arg === "*") {
        const takes = await listTakes(projectRoot, owner, pass);
        return {
            kind: "files",
            ref,
            paths: takes.map((t) => fromProjectKey(projectRoot, t.key)),
            keys: takes.map((t) => t.key),
        };
    }
    if (arg !== undefined && !isTakeId(arg)) throw new RefResolutionError(ref, `"${arg}" is not a take id (T01…T99) or *`);
    const take = await resolveTake(projectRoot, owner, pass, arg);
    if (!take) {
        throw new RefResolutionError(
            ref,
            arg ? `${owner}/${pass}/${arg} does not exist` : `${owner} has no ${pass} take yet — generate one first`,
        );
    }
    return { kind: "files", ref, paths: [fromProjectKey(projectRoot, take.key)], keys: [take.key] };
}

/** Resolve a ref to a single file path or throw when it yields several / none. */
export async function resolveRefToFile(projectRoot: string, ref: string): Promise<string> {
    const r = await resolveRef(projectRoot, ref);
    if (r.kind !== "files") throw new RefResolutionError(ref, "resolves to text, not a file");
    if (r.paths.length !== 1) throw new RefResolutionError(ref, `resolves to ${r.paths.length} files`);
    return r.paths[0];
}

/** Project-relative key of a file inside the project (helper for callers). */
export function keyOf(projectRoot: string, absPath: string): string {
    return toProjectKey(projectRoot, absPath);
}
