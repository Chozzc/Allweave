/**
 * One workflow run against one project: bind inputs (resolving `tf://`
 * refs), launch the engine, ingest outputs as takes, write provenance.
 */
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { ExecutableWorkflow } from "tongflow";
import type { ProjectRef } from "../project/manifest.ts";
import { assertPassForOwner } from "../project/naming.ts";
import {
    fromProjectKey,
    projectPaths,
    toProjectKey,
} from "../project/paths.ts";
import {
    expandTemplate,
    hasTemplateRefs,
    isTfRef,
    resolveRef,
} from "../project/refs.ts";
import {
    readWorkflowFile,
    type WorkflowDocument,
    workflowHash,
} from "../project/workflow-file.ts";
import type {
    Pass,
    Provenance,
    RunEvent,
    RunSummary,
    TakeInfo,
} from "../shared/types.ts";
import type { Studio } from "../studio.ts";
import { nowIso } from "../util/fsx.ts";
import { type IngestTarget, ingestOutputs } from "./ingest.ts";
import type { EngineRequest, EngineResult } from "./runner.ts";
import { runEngine } from "./runner.ts";

export interface RunRequest {
    projectId: string;
    /** Project key of the workflow file (mutually exclusive with `document`). */
    workflowKey?: string;
    /** In-memory document (canvas single-node runs). */
    document?: WorkflowDocument;
    /** Input name → value; overrides the file's meta.bindings. Values may be tf:// refs, project keys, URLs or literal text. */
    inputs?: Record<string, unknown>;
    target?: IngestTarget;
    targets?: Record<string, IngestTarget>;
    /** Free-form note recorded in provenance. */
    note?: string;
    /** Display label (defaults to workflow name). */
    label?: string;
    /** Keep `.runs/<runId>` after ingest (default: removed when empty). */
    keepRunDir?: boolean;
}

export interface RunOutcome {
    summary: RunSummary;
    result: EngineResult;
    texts: Record<string, string[]>;
    loose: { output: string; key: string }[];
}

type InputValue = { texts?: string[]; fileKeys?: string[] };

export async function executeRun(
    studio: Studio,
    project: ProjectRef,
    request: RunRequest,
    runId: string,
    signal: AbortSignal,
    emit: (event: RunEvent) => void,
    summary: RunSummary,
): Promise<RunOutcome> {
    const startedAt = nowIso();
    const started = Date.now();
    const doc =
        request.document ??
        (await readWorkflowFile(project.root, request.workflowKey!));
    if (!doc.executable) {
        throw new Error(
            `workflow "${request.workflowKey ?? doc.name}" has no executable graph${doc.exportError ? `: ${doc.exportError}` : " — save it once it validates"}`,
        );
    }
    if (request.target)
        assertPassForOwner(request.target.owner, request.target.pass);
    const targets = request.targets ?? doc.meta.targets;
    for (const t of Object.values(targets ?? {}))
        assertPassForOwner(t.owner, t.pass);

    const workflow = structuredClone(doc.executable) as ExecutableWorkflow;
    const missingPlugins = workflow.executableNodes
        .filter((n) => !n.pluginId)
        .map((n) => `${n.label ?? n.id.slice(0, 8)} (${n.feature})`);
    if (missingPlugins.length > 0) {
        throw new Error(
            `no plugin selected for: ${missingPlugins.join(", ")} — install one with tongflow_plugins_install and re-save the workflow`,
        );
    }

    // 1. Bind inputs.
    const bindings: Record<string, string | string[]> = {
        ...(doc.meta.bindings ?? {}),
    };
    for (const [k, v] of Object.entries(request.inputs ?? {})) {
        if (v === undefined || v === null) continue;
        bindings[k] = Array.isArray(v)
            ? v.map(String)
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
    }
    const inputs: Record<string, InputValue> = {};
    const resolved: Record<string, string[]> = {};
    const missing: string[] = [];
    for (const spec of workflow.inputs) {
        const bound = bindings[spec.name];
        if (bound === undefined) {
            if (spec.required && spec.defaultValue === undefined)
                missing.push(`${spec.name} (${spec.type})`);
            continue;
        }
        const value = await bindValue(project.root, spec.type, bound);
        inputs[spec.name] = value;
        resolved[spec.name] = value.texts ?? value.fileKeys ?? [];
    }
    if (missing.length > 0) {
        throw new Error(
            `unbound required inputs: ${missing.join(", ")} — pass them via inputs or set meta.bindings (tf:// refs, project keys or text)`,
        );
    }
    // 2. Resolve tf:// refs embedded in static data / static bindings.
    await resolveEmbeddedRefs(project.root, workflow);

    // 3. Engine.
    const runDir = join(projectPaths(project.root).runs, runId);
    await mkdir(runDir, { recursive: true });
    const python = await studio.python(emitLog(emit));
    const engineRequest: EngineRequest = {
        workflow,
        inputs,
        options: {
            plugins_dir: studio.paths.plugins,
            data_dir: studio.paths.data,
            out_dir: runDir,
            ...(studio.abiPath ? { abi_path: studio.abiPath } : {}),
            file_key_base: project.root,
            inline_outputs: false,
            auto_install: true,
            org: studio.config.pluginOrg,
            plugin_git_urls: studio.config.pluginGitUrls,
            task_id: runId,
            env: await studio.pluginEnv(),
        },
    };
    const result = await runEngine({
        python,
        request: engineRequest,
        signal,
        cwd: project.root,
        onEvent: emit,
    });
    if (result.status !== "success") {
        const detail =
            result.errors.length > 0
                ? result.errors.join("; ")
                : "workflow failed";
        throw new Error(detail);
    }

    // 4. Ingest.
    const finishedAt = nowIso();
    const provenance: Omit<Provenance, "output"> = {
        runId,
        workflow: request.workflowKey ?? `(inline) ${doc.name}`,
        workflowHash: workflowHash(doc),
        workflowName: doc.name,
        bindings,
        resolved,
        pluginIds: [
            ...new Set(workflow.executableNodes.map((n) => n.pluginId)),
        ],
        startedAt,
        finishedAt,
        durationMs: Date.now() - started,
        ...(request.note ? { note: request.note } : {}),
    };
    const ingest = await ingestOutputs({
        projectRoot: project.root,
        result,
        ...(request.target ? { target: request.target } : {}),
        ...(targets ? { targets } : {}),
        provenance,
    });
    if (!request.keepRunDir && ingest.loose.length === 0) {
        await rm(runDir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
    summary.takes = ingest.takes;
    emit({
        type: "ingested",
        at: nowIso(),
        takes: ingest.takes,
        outputs: result.outputs,
    });
    return { summary, result, texts: ingest.texts, loose: ingest.loose };
}

function emitLog(emit: (e: RunEvent) => void): (line: string) => void {
    return (line) => emit({ type: "log", at: nowIso(), message: line });
}

/** Resolve one bound value into the engine's `{texts}` / `{fileKeys}` input form. */
async function bindValue(
    projectRoot: string,
    type: string,
    bound: string | string[],
): Promise<InputValue> {
    const values = Array.isArray(bound) ? bound : [bound];
    const isText = type === "text" || type === "text[]";
    const texts: string[] = [];
    const fileKeys: string[] = [];
    for (const v of values) {
        if (isTfRef(v)) {
            const r = await resolveRef(projectRoot, v);
            if (r.kind === "texts") texts.push(...r.texts);
            else fileKeys.push(...r.paths);
            continue;
        }
        if (isText) {
            texts.push(
                hasTemplateRefs(v) ? await expandTemplate(projectRoot, v) : v,
            );
            continue;
        }
        if (/^(https?:|data:)/.test(v) || isAbsolute(v)) {
            fileKeys.push(v);
            continue;
        }
        fileKeys.push(fromProjectKey(projectRoot, v));
    }
    if (isText) return { texts };
    if (texts.length > 0 && fileKeys.length === 0) {
        throw new Error(
            `input of type ${type} was bound to text (${texts.map((t) => t.slice(0, 40)).join(", ")}) — bind a file, project key or tf:// asset ref`,
        );
    }
    return { fileKeys };
}

/** Replace `tf://` refs inside static data nodes / static bindings with absolute paths (or texts). */
async function resolveEmbeddedRefs(
    projectRoot: string,
    workflow: ExecutableWorkflow,
): Promise<void> {
    for (const dn of workflow.dataNodes) {
        const sd = dn.staticData;
        if (!sd) continue;
        if (sd.fileKeys?.some(isTfRef)) {
            const out: string[] = [];
            for (const k of sd.fileKeys) {
                if (!isTfRef(k)) {
                    out.push(k);
                    continue;
                }
                const r = await resolveRef(projectRoot, k);
                if (r.kind !== "files")
                    throw new Error(
                        `${k} resolves to text but is used as a file`,
                    );
                out.push(...r.paths);
            }
            sd.fileKeys = out;
        }
        if (sd.texts?.some((t) => isTfRef(t) || hasTemplateRefs(t))) {
            const out: string[] = [];
            for (const t of sd.texts) {
                if (isTfRef(t)) {
                    const r = await resolveRef(projectRoot, t);
                    out.push(...(r.kind === "texts" ? r.texts : r.keys));
                } else if (hasTemplateRefs(t)) {
                    out.push(await expandTemplate(projectRoot, t));
                } else {
                    out.push(t);
                }
            }
            sd.texts = out;
        }
    }
    for (const node of workflow.executableNodes) {
        for (const [field, binding] of Object.entries(node.bindings)) {
            if (binding.kind !== "static" && binding.kind !== "config")
                continue;
            if (isTfRef(binding.value)) {
                const r = await resolveRef(projectRoot, binding.value);
                if (r.kind === "texts") binding.value = r.texts.join("\n");
                else if (r.paths.length === 1) binding.value = r.paths[0];
                else
                    throw new Error(
                        `${binding.value} (in ${field}) resolves to ${r.paths.length} files; a config field takes one`,
                    );
            } else if (hasTemplateRefs(binding.value)) {
                binding.value = await expandTemplate(
                    projectRoot,
                    binding.value,
                );
            }
        }
    }
}

export function newRunSummary(
    runId: string,
    projectId: string,
    workflow: string,
    target?: IngestTarget,
): RunSummary {
    return {
        runId,
        projectId,
        workflow,
        ...(target ? { target } : {}),
        status: "queued",
        startedAt: nowIso(),
        takes: [],
        nodes: {},
    };
}

export type { IngestTarget, Pass, TakeInfo };
export { toProjectKey };
