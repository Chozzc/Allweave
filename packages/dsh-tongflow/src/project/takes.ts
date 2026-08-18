/**
 * Take management: every generated output is a numbered take under
 * `<ownerDir>/<PASS>/`, never overwritten. `takes.json` in the owner
 * directory records which take is "circled" (the one downstream references
 * resolve to by default).
 */
import {
    copyFile,
    mkdir,
    readdir,
    rename,
    stat,
    unlink,
} from "node:fs/promises";
import { extname, join } from "node:path";
import type {
    Pass,
    Provenance,
    TakeInfo,
    TakesManifest,
} from "../shared/types.ts";
import { exists, readJsonOr, writeJson } from "../util/fsx.ts";
import {
    assertPassForOwner,
    parseTakeFileName,
    provenanceFileName,
    takeFileName,
    takeId,
} from "./naming.ts";
import { ownerDir, passDir, TAKES_MANIFEST, toProjectKey } from "./paths.ts";

export async function readTakesManifest(
    projectRoot: string,
    owner: string,
): Promise<TakesManifest> {
    return readJsonOr<TakesManifest>(
        join(ownerDir(projectRoot, owner), TAKES_MANIFEST),
        { circled: {} },
    );
}

export async function writeTakesManifest(
    projectRoot: string,
    owner: string,
    manifest: TakesManifest,
): Promise<void> {
    await writeJson(
        join(ownerDir(projectRoot, owner), TAKES_MANIFEST),
        manifest,
    );
}

/** All takes of one pass, ascending by take number, with sidecar provenance when present. */
export async function listTakes(
    projectRoot: string,
    owner: string,
    pass: Pass,
): Promise<TakeInfo[]> {
    assertPassForOwner(owner, pass);
    const dir = passDir(projectRoot, owner, pass);
    if (!(await exists(dir))) return [];
    const manifest = await readTakesManifest(projectRoot, owner);
    const circled = manifest.circled[pass];
    const names = await readdir(dir);
    const out: TakeInfo[] = [];
    for (const name of names) {
        const parts = parseTakeFileName(name);
        if (!parts || parts.owner !== owner || parts.pass !== pass) continue;
        const abs = join(dir, name);
        const st = await stat(abs);
        const provenance = await readJsonOr<Provenance | undefined>(
            join(dir, provenanceFileName(owner, pass, parts.take)),
            undefined,
        );
        out.push({
            owner,
            pass,
            take: parts.take,
            takeNo: parts.takeNo,
            ext: parts.ext,
            key: toProjectKey(projectRoot, abs),
            fileName: name,
            size: st.size,
            mtime: st.mtime.toISOString(),
            circled: circled === parts.take,
            ...(provenance ? { provenance } : {}),
        });
    }
    out.sort((a, b) => a.takeNo - b.takeNo);
    return out;
}

/** Take counts + circled take for every pass of an owner (cheap overview). */
export async function takeOverview(
    projectRoot: string,
    owner: string,
    passes: readonly Pass[],
): Promise<{
    counts: Partial<Record<Pass, number>>;
    circled: Partial<Record<Pass, string>>;
}> {
    const manifest = await readTakesManifest(projectRoot, owner);
    const counts: Partial<Record<Pass, number>> = {};
    for (const pass of passes) {
        const dir = passDir(projectRoot, owner, pass);
        if (!(await exists(dir))) continue;
        const n = (await readdir(dir)).filter((name) => {
            const p = parseTakeFileName(name);
            return p !== undefined && p.owner === owner && p.pass === pass;
        }).length;
        if (n > 0) counts[pass] = n;
    }
    return { counts, circled: manifest.circled };
}

/** The circled take of a pass, else the latest take, else undefined. */
export async function resolveTake(
    projectRoot: string,
    owner: string,
    pass: Pass,
    take?: string,
): Promise<TakeInfo | undefined> {
    const takes = await listTakes(projectRoot, owner, pass);
    if (takes.length === 0) return undefined;
    if (take) return takes.find((t) => t.take === take);
    return takes.find((t) => t.circled) ?? takes[takes.length - 1];
}

export async function nextTakeNumber(
    projectRoot: string,
    owner: string,
    pass: Pass,
): Promise<number> {
    const takes = await listTakes(projectRoot, owner, pass);
    const max = takes.reduce((m, t) => Math.max(m, t.takeNo), 0);
    if (max >= 99) throw new Error(`${owner}/${pass} already has 99 takes`);
    return max + 1;
}

export interface AddTakeOptions {
    /** Move instead of copy (default: move when inside the project, else copy). */
    move?: boolean;
    provenance?: Provenance;
    /** Circle this take (default: only when it is the first take of the pass). */
    circle?: boolean;
}

/** Ingest a file as the next take of `<owner>/<pass>`; writes the provenance sidecar. */
export async function addTake(
    projectRoot: string,
    owner: string,
    pass: Pass,
    sourcePath: string,
    options: AddTakeOptions = {},
): Promise<TakeInfo> {
    assertPassForOwner(owner, pass);
    const dir = passDir(projectRoot, owner, pass);
    await mkdir(dir, { recursive: true });
    const n = await nextTakeNumber(projectRoot, owner, pass);
    const take = takeId(n);
    const ext = extname(sourcePath).replace(/^\./, "") || "bin";
    const dest = join(dir, takeFileName(owner, pass, take, ext));
    if (options.move ?? true) {
        try {
            await rename(sourcePath, dest);
        } catch {
            await copyFile(sourcePath, dest);
            await unlink(sourcePath).catch(() => undefined);
        }
    } else {
        await copyFile(sourcePath, dest);
    }
    if (options.provenance) {
        await writeJson(
            join(dir, provenanceFileName(owner, pass, take)),
            options.provenance,
        );
    }
    const manifest = await readTakesManifest(projectRoot, owner);
    const shouldCircle = options.circle ?? manifest.circled[pass] === undefined;
    if (shouldCircle) {
        manifest.circled[pass] = take;
        await writeTakesManifest(projectRoot, owner, manifest);
    }
    const info = (await listTakes(projectRoot, owner, pass)).find(
        (t) => t.take === take,
    );
    if (!info) throw new Error(`take ${take} vanished after ingest`);
    return info;
}

export async function circleTake(
    projectRoot: string,
    owner: string,
    pass: Pass,
    take: string,
): Promise<TakeInfo> {
    const takes = await listTakes(projectRoot, owner, pass);
    const found = takes.find((t) => t.take === take);
    if (!found) throw new Error(`${owner}/${pass}/${take} does not exist`);
    const manifest = await readTakesManifest(projectRoot, owner);
    manifest.circled[pass] = take;
    await writeTakesManifest(projectRoot, owner, manifest);
    return { ...found, circled: true };
}

export async function deleteTake(
    projectRoot: string,
    owner: string,
    pass: Pass,
    take: string,
): Promise<void> {
    const takes = await listTakes(projectRoot, owner, pass);
    const found = takes.find((t) => t.take === take);
    if (!found) throw new Error(`${owner}/${pass}/${take} does not exist`);
    const dir = passDir(projectRoot, owner, pass);
    await unlink(join(dir, found.fileName));
    await unlink(join(dir, provenanceFileName(owner, pass, take))).catch(
        () => undefined,
    );
    const manifest = await readTakesManifest(projectRoot, owner);
    if (manifest.circled[pass] === take) {
        const remaining = takes.filter((t) => t.take !== take);
        if (remaining.length > 0)
            manifest.circled[pass] = remaining[remaining.length - 1].take;
        else delete manifest.circled[pass];
        await writeTakesManifest(projectRoot, owner, manifest);
    }
}
