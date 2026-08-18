/**
 * The bible: characters, locations, props and style entities. Each lives in
 * `02_PREPRO/bible/<ID>/` with a human `card.md`, a machine `consistency.json`
 * and its REF / VO take folders.
 */
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
    ConsistencyKit,
    EntityDetail,
    EntitySummary,
} from "../shared/types.ts";
import { exists, readJsonOr, writeFileAtomic, writeJson } from "../util/fsx.ts";
import { ENTITY_PASSES, entityKindOf, isEntityId } from "./naming.ts";
import {
    CARD_FILE,
    CONSISTENCY_FILE,
    entityDir,
    projectPaths,
} from "./paths.ts";
import { takeOverview } from "./takes.ts";

export async function listEntities(
    projectRoot: string,
): Promise<EntitySummary[]> {
    const bible = projectPaths(projectRoot).bible;
    if (!(await exists(bible))) return [];
    const names = (await readdir(bible, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && isEntityId(e.name))
        .map((e) => e.name)
        .sort();
    const out: EntitySummary[] = [];
    for (const id of names) out.push(await entitySummary(projectRoot, id));
    return out;
}

async function entitySummary(
    projectRoot: string,
    id: string,
): Promise<EntitySummary> {
    const dir = entityDir(projectRoot, id);
    const card = await readCard(dir);
    const { counts, circled } = await takeOverview(
        projectRoot,
        id,
        ENTITY_PASSES,
    );
    return {
        id,
        kind: entityKindOf(id),
        name: cardTitle(card) ?? id,
        ...(cardSummary(card) ? { summary: cardSummary(card) } : {}),
        circled,
        takeCounts: counts,
    };
}

export async function getEntity(
    projectRoot: string,
    id: string,
): Promise<EntityDetail | undefined> {
    if (!isEntityId(id)) throw new Error(`invalid entity id "${id}"`);
    const dir = entityDir(projectRoot, id);
    if (!(await exists(dir))) return undefined;
    const summary = await entitySummary(projectRoot, id);
    const card = await readCard(dir);
    const consistency = await readJsonOr<ConsistencyKit>(
        join(dir, CONSISTENCY_FILE),
        {},
    );
    return { ...summary, card, consistency };
}

export interface UpsertEntityInput {
    id: string;
    /** Full markdown replacement for card.md (omit to keep). */
    card?: string;
    /** Merged into consistency.json (omit to keep; explicit `null` values delete keys). */
    consistency?: Partial<Record<keyof ConsistencyKit, unknown>>;
}

export async function upsertEntity(
    projectRoot: string,
    input: UpsertEntityInput,
): Promise<EntityDetail> {
    if (!isEntityId(input.id)) {
        throw new Error(
            `invalid entity id "${input.id}" — use CHR_/LOC_/PRP_/STY_ + UPPER_SNAKE (e.g. CHR_MEI, LOC_ROOFTOP)`,
        );
    }
    const dir = entityDir(projectRoot, input.id);
    await mkdir(dir, { recursive: true });
    for (const pass of ENTITY_PASSES)
        await mkdir(join(dir, pass), { recursive: true });
    const cardPath = join(dir, CARD_FILE);
    if (input.card !== undefined) {
        await writeFileAtomic(
            cardPath,
            input.card.endsWith("\n") ? input.card : `${input.card}\n`,
        );
    } else if (!(await exists(cardPath))) {
        await writeFileAtomic(cardPath, `# ${input.id}\n\n`);
    }
    const consistencyPath = join(dir, CONSISTENCY_FILE);
    if (input.consistency !== undefined) {
        const current = await readJsonOr<Record<string, unknown>>(
            consistencyPath,
            {},
        );
        for (const [k, v] of Object.entries(input.consistency)) {
            if (v === null || v === undefined) delete current[k];
            else current[k] = v;
        }
        await writeJson(consistencyPath, current);
    } else if (!(await exists(consistencyPath))) {
        await writeJson(consistencyPath, {});
    }
    const detail = await getEntity(projectRoot, input.id);
    if (!detail) throw new Error("entity vanished after upsert");
    return detail;
}

export async function deleteEntity(
    projectRoot: string,
    id: string,
): Promise<void> {
    if (!isEntityId(id)) throw new Error(`invalid entity id "${id}"`);
    await rm(entityDir(projectRoot, id), { recursive: true, force: true });
}

async function readCard(dir: string): Promise<string> {
    try {
        return await readFile(join(dir, CARD_FILE), "utf8");
    } catch {
        return "";
    }
}

/** First `# Heading` of the card. */
export function cardTitle(card: string): string | undefined {
    const m = /^#\s+(.+?)\s*$/m.exec(card);
    return m?.[1];
}

/** First non-empty, non-heading paragraph line, trimmed to ~140 chars. */
export function cardSummary(card: string): string | undefined {
    for (const raw of card.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        return line.length > 140 ? `${line.slice(0, 137)}…` : line;
    }
    return undefined;
}
