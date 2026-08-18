/**
 * `*.tongflow.json` files — the agent-authored workflow documents. The file on
 * disk is the single source of truth: tools hydrate a headless store from it,
 * apply a change, re-export and write it back; the canvas loads and saves the
 * same file. Shape (a superset of what the TongFlow app imports):
 *
 *   { name, description?, flow: { nodes, edges }, executable?, meta }
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    createFlowStore,
    type ExecutableWorkflow,
    exportWorkflow,
    type FlowStore,
    featureForNodeType,
    isAbiNodeType,
    type PluginsRegistry,
    parseWorkflowImportJson,
} from "tongflow";
import type { WorkflowFileMeta, WorkflowSummary } from "../shared/types.ts";
import { exists, writeFileAtomic } from "../util/fsx.ts";
import { WORKFLOW_EXT, fromProjectKey, projectPaths, toProjectKey } from "./paths.ts";

type Node = ExecutableWorkflow["originalFlow"]["nodes"][number];
type Edge = ExecutableWorkflow["originalFlow"]["edges"][number];

export interface WorkflowDocument {
    name: string;
    description?: string;
    flow: { nodes: Node[]; edges: Edge[] };
    executable?: ExecutableWorkflow;
    /** Set when the last save could not export (graph incomplete). */
    exportError?: string;
    meta: WorkflowFileMeta;
}

export function isWorkflowKey(key: string): boolean {
    return key.endsWith(WORKFLOW_EXT);
}

/** Normalize a user/agent supplied workflow path to a project key under workflows/. */
export function normalizeWorkflowKey(input: string): string {
    let key = input.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!key) throw new Error("workflow path is required");
    if (!key.includes("/")) key = `workflows/${key}`;
    if (!key.endsWith(WORKFLOW_EXT)) {
        key = key.endsWith(".json") ? key.slice(0, -".json".length) + WORKFLOW_EXT : key + WORKFLOW_EXT;
    }
    if (key.includes("..")) throw new Error(`invalid workflow path "${input}"`);
    return key;
}

export async function readWorkflowFile(projectRoot: string, key: string): Promise<WorkflowDocument> {
    const abs = fromProjectKey(projectRoot, key);
    const raw = await readFile(abs, "utf8");
    return parseWorkflowDocument(raw, basename(key, WORKFLOW_EXT));
}

export function parseWorkflowDocument(raw: string, fallbackName: string): WorkflowDocument {
    const parsed = parseWorkflowImportJson(raw);
    let obj: Record<string, unknown> = {};
    try {
        obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        // parseWorkflowImportJson already validated; keep obj empty
    }
    const meta = (obj.meta && typeof obj.meta === "object" ? obj.meta : {}) as WorkflowFileMeta;
    const executable =
        obj.executable && typeof obj.executable === "object" ? (obj.executable as ExecutableWorkflow) : undefined;
    return {
        name: parsed.name ?? fallbackName,
        ...(parsed.description ? { description: parsed.description } : {}),
        flow: { nodes: parsed.nodes as Node[], edges: parsed.edges as Edge[] },
        ...(executable ? { executable } : {}),
        ...(typeof obj.exportError === "string" ? { exportError: obj.exportError } : {}),
        meta,
    };
}

export function hydrateStore(doc: WorkflowDocument): FlowStore {
    return createFlowStore({
        initial: {
            nodes: doc.flow.nodes,
            edges: doc.flow.edges,
            workflowName: doc.name,
            workflowDescription: doc.description ?? "",
        },
    });
}

/**
 * Give every executable node without an explicit plugin the registry's
 * default for its slot. Headless authoring never mounts the canvas' plugin
 * resolver, so this is what makes an exported node runnable.
 */
export function fillDefaultPlugins(store: FlowStore, registry: PluginsRegistry | undefined): string[] {
    if (!registry) return [];
    const missing: string[] = [];
    const { nodes } = store.getState();
    const next = nodes.map((node) => {
        const type = node.type ?? "";
        if (!isAbiNodeType(type)) return node;
        const data = (node.data ?? {}) as Record<string, unknown>;
        if (typeof data.pluginId === "string" && data.pluginId.trim()) return node;
        const feature = featureForNodeType(type);
        const candidates = feature ? (registry.nodePluginMap[feature] ?? []) : [];
        if (candidates.length === 0) {
            missing.push(`${node.id.slice(0, 8)} (${type}) — no plugin installed for "${feature}"`);
            return node;
        }
        return { ...node, data: { ...data, pluginId: candidates[0] } };
    });
    store.setState({ nodes: next } as Partial<ReturnType<FlowStore["getState"]>>);
    return missing;
}

/**
 * Mirror upstream data-node payloads (texts / fileKeys) into the downstream
 * executable node's `data`, the way the canvas' compose action snapshots them.
 * Canvas node components gate their execute button on that snapshot, while
 * the exporter reads edges — so a headless patch must keep both in step.
 */
export function mirrorUpstreamPayloads(store: FlowStore): void {
    const { nodes, edges } = store.getState();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let changed = false;
    const next = nodes.map((node) => {
        const type = node.type ?? "";
        if (!isAbiNodeType(type)) return node;
        const texts: string[] = [];
        const fileKeys: string[] = [];
        for (const e of edges) {
            if (e.target !== node.id) continue;
            const src = byId.get(e.source);
            if (!src || isAbiNodeType(src.type ?? "")) continue;
            const d = (src.data ?? {}) as { texts?: unknown; fileKeys?: unknown };
            if (Array.isArray(d.texts)) texts.push(...d.texts.filter((t): t is string => typeof t === "string"));
            if (Array.isArray(d.fileKeys)) fileKeys.push(...d.fileKeys.filter((k): k is string => typeof k === "string"));
        }
        const data = { ...((node.data ?? {}) as Record<string, unknown>) };
        const same = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
        let touched = false;
        if (texts.length > 0 && !same(data.texts, texts)) {
            data.texts = texts;
            touched = true;
        }
        if (fileKeys.length > 0 && !same(data.fileKeys, fileKeys)) {
            data.fileKeys = fileKeys;
            touched = true;
        }
        if (!touched) return node;
        changed = true;
        return { ...node, data };
    });
    if (changed) store.setState({ nodes: next } as Partial<ReturnType<FlowStore["getState"]>>);
}

export interface SaveOptions {
    registry?: PluginsRegistry;
    meta?: WorkflowFileMeta;
    name?: string;
    description?: string;
}

/** Export the store and write the document; returns the saved document. */
export async function saveWorkflowFile(
    projectRoot: string,
    key: string,
    store: FlowStore,
    options: SaveOptions = {},
): Promise<WorkflowDocument> {
    fillDefaultPlugins(store, options.registry);
    mirrorUpstreamPayloads(store);
    const state = store.getState();
    const name = options.name ?? state.workflowName ?? basename(key, WORKFLOW_EXT);
    const description = options.description ?? state.workflowDescription ?? "";
    let executable: ExecutableWorkflow | undefined;
    let exportError: string | undefined;
    try {
        executable = exportWorkflow(state.nodes, state.edges, {
            name,
            description,
            includeOriginalFlow: false,
        });
    } catch (error) {
        exportError = error instanceof Error ? error.message : String(error);
    }
    const doc: WorkflowDocument = {
        name,
        ...(description ? { description } : {}),
        flow: { nodes: state.nodes, edges: state.edges },
        ...(executable ? { executable } : {}),
        ...(exportError ? { exportError } : {}),
        meta: options.meta ?? {},
    };
    await writeWorkflowDocument(projectRoot, key, doc);
    return doc;
}

export async function writeWorkflowDocument(projectRoot: string, key: string, doc: WorkflowDocument): Promise<void> {
    const abs = fromProjectKey(projectRoot, key);
    await writeFileAtomic(abs, `${JSON.stringify(doc, null, 2)}\n`);
}

export async function deleteWorkflowFile(projectRoot: string, key: string): Promise<void> {
    await unlink(fromProjectKey(projectRoot, key));
}

export function workflowHash(doc: WorkflowDocument): string {
    return createHash("sha256")
        .update(JSON.stringify(doc.executable ?? doc.flow))
        .digest("hex")
        .slice(0, 16);
}

export async function summarizeWorkflow(projectRoot: string, key: string): Promise<WorkflowSummary> {
    const abs = fromProjectKey(projectRoot, key);
    const [doc, st] = await Promise.all([readWorkflowFile(projectRoot, key), stat(abs)]);
    const bindings = doc.meta.bindings ?? {};
    return {
        key,
        name: doc.name,
        ...(doc.description ? { description: doc.description } : {}),
        nodeCount: doc.flow.nodes.length,
        inputs: (doc.executable?.inputs ?? []).map((i) => ({
            name: i.name,
            type: i.type,
            required: i.required,
            ...(bindings[i.name] !== undefined ? { bound: bindings[i.name] } : {}),
        })),
        outputs: (doc.executable?.outputs ?? []).map((o) => ({ name: o.name, type: o.type })),
        meta: doc.meta,
        mtime: st.mtime.toISOString(),
    };
}

/** Every workflow file under workflows/ (non-recursive), newest first. */
export async function listWorkflows(projectRoot: string): Promise<WorkflowSummary[]> {
    const dir = projectPaths(projectRoot).workflows;
    if (!(await exists(dir))) return [];
    const names = (await readdir(dir)).filter((n) => n.endsWith(WORKFLOW_EXT)).sort();
    const out: WorkflowSummary[] = [];
    for (const name of names) {
        try {
            out.push(await summarizeWorkflow(projectRoot, toProjectKey(projectRoot, join(dir, name))));
        } catch {
            // unreadable file: skip
        }
    }
    return out;
}
