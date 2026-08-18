/**
 * Turn engine outputs into takes: every file the workflow produced becomes
 * the next numbered take of the target owner/pass, with a provenance sidecar.
 * Text outputs are returned as-is (they are not takes).
 */
import { isAbsolute, resolve } from "node:path";
import { isInsideProject, toProjectKey } from "../project/paths.ts";
import { addTake } from "../project/takes.ts";
import type { Pass, Provenance, TakeInfo } from "../shared/types.ts";
import type { EngineResult } from "./runner.ts";

export interface IngestTarget {
    owner: string;
    pass: Pass;
}

export interface IngestOptions {
    projectRoot: string;
    result: EngineResult;
    /** Default target for every file output. */
    target?: IngestTarget;
    /** Per-output overrides (workflow output name → target). */
    targets?: Record<string, IngestTarget>;
    provenance: Omit<Provenance, "output">;
}

export interface IngestOutcome {
    takes: TakeInfo[];
    /** Files produced but not ingested (no target): project-relative keys. */
    loose: { output: string; key: string }[];
    texts: Record<string, string[]>;
}

/** Collect `file_key` strings from a raw node output object (fallback when outputs_by_name is empty). */
function collectFileKeys(value: unknown, into: string[]): void {
    if (!value) return;
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
        for (const v of value) collectFileKeys(v, into);
        return;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj.file_key === "string") {
            into.push(obj.file_key);
            return;
        }
        for (const v of Object.values(obj)) collectFileKeys(v, into);
    }
}

function looksLikeFile(value: string): boolean {
    return (
        /\.[A-Za-z0-9]{1,5}$/.test(value) &&
        !/\s/.test(value) &&
        (value.includes("/") || value.startsWith("."))
    );
}

export async function ingestOutputs(
    options: IngestOptions,
): Promise<IngestOutcome> {
    const { projectRoot, result } = options;
    const outcome: IngestOutcome = { takes: [], loose: [], texts: {} };
    const byName: Record<string, string[]> = {
        ...(result.outputs_by_name ?? {}),
    };
    if (Object.keys(byName).length === 0) {
        // Fall back to scanning raw node outputs for file refs.
        for (const [nodeId, out] of Object.entries(result.outputs ?? {})) {
            const keys: string[] = [];
            collectFileKeys(out, keys);
            if (keys.length > 0) byName[nodeId] = keys;
        }
    }
    for (const [output, values] of Object.entries(byName)) {
        const target = options.targets?.[output] ?? options.target;
        for (const value of values) {
            const abs = isAbsolute(value) ? value : resolve(projectRoot, value);
            const isFile =
                looksLikeFile(value) && isInsideProject(projectRoot, abs);
            if (!isFile) {
                if (!outcome.texts[output]) outcome.texts[output] = [];
                outcome.texts[output].push(value);
                continue;
            }
            const key = toProjectKey(projectRoot, abs);
            if (!target) {
                outcome.loose.push({ output, key });
                continue;
            }
            const take = await addTake(
                projectRoot,
                target.owner,
                target.pass,
                abs,
                {
                    move: true,
                    provenance: { ...options.provenance, output },
                },
            );
            outcome.takes.push(take);
        }
    }
    return outcome;
}
