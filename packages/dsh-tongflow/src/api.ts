/**
 * StudioApi — the one service layer both the agent tools and the HTTP routes
 * call. Everything is keyed by project id; the project directory on disk is
 * the source of truth (no in-memory canvas state).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    type ExecuteToolContext,
    type GraphPatch,
    KNOWN_NODE_TYPES,
    NODE_TYPE_TO_ABI_FEATURE,
    type ToolResult,
    executeGraphTool,
    renderCanvas,
    resolvedSpecForNodeType,
} from "tongflow";
import type { RunRequest } from "./engine/run.ts";
import type { RunRecord } from "./engine/runs.ts";
import { type CanvasTaskBody, singleNodeDocument } from "./engine/single-node.ts";
import { deleteEntity, getEntity, listEntities, type UpsertEntityInput, upsertEntity } from "./project/bible.ts";
import { listEpisodes, readBreakdown, shotStatuses, writeBreakdown } from "./project/breakdown.ts";
import { type ProjectRef, listProjects, loadProject, summarize } from "./project/manifest.ts";
import { ENTITY_PASSES, EPISODE_PASSES, SHOT_PASSES, isEpisodeId, ownerKindOf, passesFor, type Pass } from "./project/naming.ts";
import { DIRS, WORKFLOW_EXT, fromProjectKey, projectPaths, toProjectKey } from "./project/paths.ts";
import { resolveRef } from "./project/refs.ts";
import { circleTake, deleteTake, listTakes, takeOverview } from "./project/takes.ts";
import { type CreateProjectInput, createProject, listTemplates } from "./project/templates.ts";
import {
    type WorkflowDocument,
    deleteWorkflowFile,
    hydrateStore,
    isWorkflowKey,
    listWorkflows,
    normalizeWorkflowKey,
    readWorkflowFile,
    saveWorkflowFile,
    summarizeWorkflow,
    workflowHash,
} from "./project/workflow-file.ts";
import type {
    EntityDetail,
    EntitySummary,
    EpisodeBreakdown,
    ProjectSummary,
    TakeInfo,
    TreeNode,
    WorkflowFileMeta,
    WorkflowSummary,
} from "./shared/types.ts";
import { modalityOfExt } from "./shared/types.ts";
import type { Studio } from "./studio.ts";
import { exists, nowIso, writeFileAtomic } from "./util/fsx.ts";

export class StudioApi {
    constructor(readonly studio: Studio) {}

    /* ---------------- projects ---------------- */

    listTemplates() {
        return listTemplates();
    }

    listProjects(): Promise<ProjectSummary[]> {
        return listProjects(this.studio.paths.root);
    }

    async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
        const { id } = await createProject(this.studio.paths.root, input);
        return summarize(await this.project(id));
    }

    project(projectId: string): Promise<ProjectRef> {
        return loadProject(this.studio.paths.root, projectId);
    }

    async projectSummary(projectId: string): Promise<ProjectSummary> {
        return summarize(await this.project(projectId));
    }

    /** The crew board: entities, episodes → shots with pass status, workflows, recent runs. */
    async status(projectId: string) {
        const ref = await this.project(projectId);
        const [summary, entities, episodes, workflows] = await Promise.all([
            summarize(ref),
            listEntities(ref.root),
            listEpisodes(ref.root),
            listWorkflows(ref.root),
        ]);
        const episodeBoards = [];
        for (const ep of episodes) {
            const shots = await shotStatuses(ref.root, ep);
            const post = await takeOverview(ref.root, ep, EPISODE_PASSES);
            episodeBoards.push({ episode: ep, shots, post });
        }
        return {
            project: summary,
            entities,
            episodes: episodeBoards,
            workflows,
            runs: this.studio.runs.list(projectId).slice(0, 10),
        };
    }

    /* ---------------- bible ---------------- */

    async listEntities(projectId: string): Promise<EntitySummary[]> {
        return listEntities((await this.project(projectId)).root);
    }

    async getEntity(projectId: string, id: string): Promise<EntityDetail | undefined> {
        return getEntity((await this.project(projectId)).root, id);
    }

    async upsertEntity(projectId: string, input: UpsertEntityInput): Promise<EntityDetail> {
        return upsertEntity((await this.project(projectId)).root, input);
    }

    async deleteEntity(projectId: string, id: string): Promise<void> {
        return deleteEntity((await this.project(projectId)).root, id);
    }

    /* ---------------- breakdown ---------------- */

    async getBreakdown(projectId: string, episode: string): Promise<EpisodeBreakdown | undefined> {
        return readBreakdown((await this.project(projectId)).root, episode);
    }

    async setBreakdown(projectId: string, breakdown: EpisodeBreakdown): Promise<EpisodeBreakdown> {
        const ref = await this.project(projectId);
        return writeBreakdown(this.studio.paths.root, projectId, breakdown, ref.manifest.naming.shotStep);
    }

    async shotStatuses(projectId: string, episode: string) {
        return shotStatuses((await this.project(projectId)).root, episode);
    }

    /* ---------------- takes ---------------- */

    async listTakes(projectId: string, owner: string, pass: Pass): Promise<TakeInfo[]> {
        return listTakes((await this.project(projectId)).root, owner, pass);
    }

    async allTakes(projectId: string, owner: string): Promise<Record<string, TakeInfo[]>> {
        const root = (await this.project(projectId)).root;
        const out: Record<string, TakeInfo[]> = {};
        for (const pass of passesFor(ownerKindOf(owner))) {
            const takes = await listTakes(root, owner, pass);
            if (takes.length > 0) out[pass] = takes;
        }
        return out;
    }

    async circleTake(projectId: string, owner: string, pass: Pass, take: string): Promise<TakeInfo> {
        return circleTake((await this.project(projectId)).root, owner, pass, take);
    }

    async deleteTake(projectId: string, owner: string, pass: Pass, take: string): Promise<void> {
        return deleteTake((await this.project(projectId)).root, owner, pass, take);
    }

    /** Append a dated review note under dailies/. */
    async addNote(projectId: string, subject: string, text: string): Promise<string> {
        const ref = await this.project(projectId);
        const day = nowIso().slice(0, 10).replace(/-/g, "");
        const safe = subject.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "note";
        const key = `${DIRS.dailies}/${day}_${safe}.md`;
        const abs = fromProjectKey(ref.root, key);
        const prev = (await exists(abs)) ? await readFile(abs, "utf8") : `# ${subject}\n`;
        await writeFileAtomic(abs, `${prev.trimEnd()}\n\n## ${nowIso()}\n\n${text.trim()}\n`);
        return key;
    }

    async resolveRef(projectId: string, ref: string) {
        return resolveRef((await this.project(projectId)).root, ref);
    }

    /* ---------------- workflows ---------------- */

    async listWorkflows(projectId: string): Promise<WorkflowSummary[]> {
        return listWorkflows((await this.project(projectId)).root);
    }

    async readWorkflow(projectId: string, key: string): Promise<WorkflowDocument> {
        return readWorkflowFile((await this.project(projectId)).root, normalizeWorkflowKey(key));
    }

    async workflowSummary(projectId: string, key: string): Promise<WorkflowSummary> {
        return summarizeWorkflow((await this.project(projectId)).root, normalizeWorkflowKey(key));
    }

    /** Create an empty workflow file, or copy one (template key or another workflow) — never overwrites. */
    async newWorkflow(
        projectId: string,
        keyInput: string,
        options: { fromTemplate?: string; name?: string; description?: string; meta?: WorkflowFileMeta } = {},
    ): Promise<WorkflowSummary> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const abs = fromProjectKey(ref.root, key);
        if (await exists(abs)) throw new Error(`${key} already exists — patch it, or pick another name`);
        let doc: WorkflowDocument;
        if (options.fromTemplate) {
            const src = await this.readWorkflow(projectId, options.fromTemplate);
            doc = { ...src, meta: { ...src.meta, ...(options.meta ?? {}), template: normalizeWorkflowKey(options.fromTemplate) } };
            if (options.name) doc.name = options.name;
            if (options.description !== undefined) doc.description = options.description;
        } else {
            doc = {
                name: options.name ?? basename(key, WORKFLOW_EXT),
                ...(options.description ? { description: options.description } : {}),
                flow: { nodes: [], edges: [] },
                meta: options.meta ?? {},
            };
        }
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        await saveWorkflowFile(ref.root, key, store, { registry, meta: doc.meta, name: doc.name, description: doc.description ?? "" });
        return summarizeWorkflow(ref.root, key);
    }

    /** Run one of the tongflow graph tools (apply_graph_patch / read_canvas / validate_workflow / describe_node_type) against a file. */
    async graphTool(projectId: string, keyInput: string, tool: string, args: Record<string, unknown>): Promise<ToolResult & { workflow?: string; rendered?: string }> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        const context: ExecuteToolContext = { registry, statusByNodeId: this.nodeStatuses(projectId, key) };
        const result = executeGraphTool(store, tool, args, context);
        if (tool === "apply_graph_patch") {
            await saveWorkflowFile(ref.root, key, store, { registry, meta: doc.meta });
            const state = store.getState();
            return { ...result, workflow: key, rendered: renderCanvas(state.nodes, state.edges, { maxText: 80 }) };
        }
        return { ...result, workflow: key };
    }

    async patchWorkflow(projectId: string, key: string, patch: GraphPatch) {
        return this.graphTool(projectId, key, "apply_graph_patch", patch as unknown as Record<string, unknown>);
    }

    /** Full read: rendered canvas + inputs/outputs + bindings + validation. */
    async describeWorkflow(projectId: string, keyInput: string) {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        const validation = executeGraphTool(store, "validate_workflow", {}, { registry });
        const summary = await summarizeWorkflow(ref.root, key);
        return {
            ok: true as const,
            workflow: key,
            name: doc.name,
            description: doc.description,
            canvas: renderCanvas(doc.flow.nodes, doc.flow.edges, { maxText: 200 }),
            inputs: summary.inputs,
            outputs: summary.outputs,
            meta: doc.meta,
            executable: Boolean(doc.executable),
            exportError: doc.exportError,
            validation,
            hash: workflowHash(doc),
        };
    }

    /** Update meta (bindings / target / purpose) without touching the graph. */
    async bindWorkflow(projectId: string, keyInput: string, patch: Partial<WorkflowFileMeta> & { unbind?: string[] }): Promise<WorkflowSummary> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const meta: WorkflowFileMeta = { ...doc.meta };
        if (patch.bindings) meta.bindings = { ...(meta.bindings ?? {}), ...patch.bindings };
        for (const name of patch.unbind ?? []) if (meta.bindings) delete meta.bindings[name];
        if (patch.target !== undefined) meta.target = patch.target;
        if (patch.purpose !== undefined) meta.purpose = patch.purpose;
        // Validate that bound names exist as inputs (advisory error).
        const inputNames = new Set((doc.executable?.inputs ?? []).map((i) => i.name));
        const unknown = Object.keys(meta.bindings ?? {}).filter((n) => !inputNames.has(n));
        if (unknown.length > 0) {
            throw new Error(
                inputNames.size === 0
                    ? `this workflow has no inputs (every level-0 data node carries static data); to parameterize it add a data node WITHOUT data — or put tf:// refs / {{tf://…}} templates directly into node data. Rejected: ${unknown.join(", ")}`
                    : `unknown input names: ${unknown.join(", ")} (inputs: ${[...inputNames].join(", ")})`,
            );
        }
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        await saveWorkflowFile(ref.root, key, store, { registry, meta });
        return summarizeWorkflow(ref.root, key);
    }

    /** Save a document coming from the canvas (flow already edited client-side). */
    async saveWorkflowDocument(projectId: string, keyInput: string, doc: WorkflowDocument): Promise<WorkflowSummary> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        await saveWorkflowFile(ref.root, key, store, { registry, meta: doc.meta, name: doc.name, description: doc.description ?? "" });
        return summarizeWorkflow(ref.root, key);
    }

    async deleteWorkflow(projectId: string, key: string): Promise<void> {
        await deleteWorkflowFile((await this.project(projectId)).root, normalizeWorkflowKey(key));
    }

    /* ---------------- runs ---------------- */

    async startRun(request: RunRequest): Promise<RunRecord> {
        const project = await this.project(request.projectId);
        const req: RunRequest = { ...request };
        if (req.workflowKey) {
            req.workflowKey = normalizeWorkflowKey(req.workflowKey);
            if (!req.target) {
                const doc = await readWorkflowFile(project.root, req.workflowKey);
                if (doc.meta.target) req.target = doc.meta.target;
            }
        }
        return this.studio.runs.start(project, req);
    }

    /** Canvas single-node execution → a run of a one-node inline document. */
    async startCanvasRun(projectId: string, body: CanvasTaskBody): Promise<RunRecord> {
        const project = await this.project(projectId);
        const document = await singleNodeDocument(project.root, body);
        return this.studio.runs.start(project, {
            projectId,
            document,
            label: `canvas ${body.feature}`,
            keepRunDir: true,
        });
    }

    getRun(runId: string): RunRecord | undefined {
        return this.studio.runs.get(runId);
    }

    listRuns(projectId?: string) {
        return this.studio.runs.list(projectId);
    }

    /** nodeId → status for the given workflow, from the latest run touching it. */
    private nodeStatuses(projectId: string, key: string): Record<string, string> {
        const latest = this.studio.runs.list(projectId).find((r) => r.workflow === key);
        if (!latest) return {};
        return Object.fromEntries(Object.entries(latest.nodes).map(([id, n]) => [id, n.status]));
    }

    /* ---------------- plugins ---------------- */

    async registry() {
        return this.studio.registry.get();
    }

    async installPlugin(idOrUrl: string) {
        return this.studio.registry.install(idOrUrl);
    }

    async uninstallPlugin(id: string) {
        return this.studio.registry.uninstall(id);
    }

    async updatePlugins(ids?: string[]) {
        return this.studio.registry.update(ids);
    }

    /** One line per node type: what it does, what it wires, what it emits, which plugins implement it. */
    async nodeCatalog(): Promise<string> {
        const { registry } = await this.studio.registry.get();
        const lines: string[] = [];
        for (const type of KNOWN_NODE_TYPES) {
            const feature = NODE_TYPE_TO_ABI_FEATURE[type];
            if (!feature) {
                lines.push(`- ${type}: data node (${type.startsWith("add") ? "input asset / text" : "carries " + type.replace(/Node$/, "")})`);
                continue;
            }
            const spec = resolvedSpecForNodeType(type);
            if (!spec) continue;
            const wires: string[] = [];
            const config: string[] = [];
            for (const field of spec.topology.inputOrder) {
                const f = spec.fields[field];
                if (f.kind === "handle") wires.push(`${field}←${f.nodeType.replace(/Node$/, "")}${f.array || f.collect ? "[]" : ""}${f.required ? "*" : ""}`);
                else config.push(`${field}${f.required ? "*" : ""}`);
            }
            const outs = spec.topology.outputs.map((o) => `${o.field}→${o.nodeType.replace(/Node$/, "")}`);
            const plugins = registry.nodePluginMap[feature] ?? [];
            lines.push(
                `- ${type} (${feature}): wires ${wires.join(", ") || "-"}; config ${config.join(", ") || "-"}; out ${outs.join(", ") || "-"}; plugins: ${plugins.length ? plugins.join(", ") : "NONE INSTALLED"}`,
            );
        }
        return lines.join("\n");
    }

    /* ---------------- files & tree ---------------- */

    async readTextFile(projectId: string, key: string): Promise<string> {
        const ref = await this.project(projectId);
        return readFile(fromProjectKey(ref.root, key), "utf8");
    }

    async writeTextFile(projectId: string, key: string, text: string): Promise<void> {
        const ref = await this.project(projectId);
        await writeFileAtomic(fromProjectKey(ref.root, key), text);
    }

    async filePath(projectId: string, key: string): Promise<string> {
        const ref = await this.project(projectId);
        return fromProjectKey(ref.root, key);
    }

    /** Studio tree for the left pane: Bible / Script / Breakdown / Shots / Post / Workflows / Dailies. */
    async tree(projectId: string): Promise<TreeNode[]> {
        const ref = await this.project(projectId);
        const p = projectPaths(ref.root);
        const [entities, episodes, workflows] = await Promise.all([listEntities(ref.root), listEpisodes(ref.root), listWorkflows(ref.root)]);
        const nodes: TreeNode[] = [];
        nodes.push({
            id: "dev",
            label: "Script",
            kind: "folder",
            children: await this.dirTree(ref.root, p.dev, DIRS.dev),
        });
        nodes.push({
            id: "bible",
            label: "Bible",
            kind: "folder",
            children: entities.map((e) => ({
                id: e.id,
                label: `${e.name} · ${e.id}`,
                kind: "entity",
                meta: { kind: e.kind, circled: e.circled, takeCounts: e.takeCounts },
                children: ENTITY_PASSES.map((pass) => ({ id: `${e.id}/${pass}`, label: pass, kind: "folder", meta: { owner: e.id, pass } })),
            })),
        });
        const shotsChildren: TreeNode[] = [];
        for (const ep of episodes) {
            const bd = await readBreakdown(ref.root, ep);
            const scenes: TreeNode[] = [];
            for (const scene of bd?.scenes ?? []) {
                const shots: TreeNode[] = [];
                for (const shot of scene.shots) {
                    const ov = await takeOverview(ref.root, shot.id, SHOT_PASSES);
                    shots.push({
                        id: shot.id,
                        label: shot.id.slice(-6),
                        kind: "shot",
                        meta: { breakdown: shot, circled: ov.circled, takeCounts: ov.counts },
                        children: SHOT_PASSES.map((pass) => ({ id: `${shot.id}/${pass}`, label: pass, kind: "folder", meta: { owner: shot.id, pass } })),
                    });
                }
                scenes.push({ id: scene.id, label: `${scene.id.slice(-5)} ${scene.title ?? scene.location ?? ""}`.trim(), kind: "scene", children: shots });
            }
            const post = await takeOverview(ref.root, ep, EPISODE_PASSES);
            shotsChildren.push({
                id: ep,
                label: `${ep}${bd?.title ? ` · ${bd.title}` : ""}`,
                kind: "episode",
                meta: { breakdownKey: `${DIRS.breakdown}/${ep}/scenes.json`, post },
                children: [
                    ...scenes,
                    {
                        id: `${ep}/post`,
                        label: "Post",
                        kind: "folder",
                        children: EPISODE_PASSES.map((pass) => ({ id: `${ep}/${pass}`, label: pass, kind: "folder", meta: { owner: ep, pass } })),
                    },
                ],
            });
        }
        nodes.push({ id: "episodes", label: "Episodes", kind: "folder", children: shotsChildren });
        nodes.push({
            id: "workflows",
            label: "Workflows",
            kind: "folder",
            children: workflows.map((w) => ({ id: w.key, label: w.name, kind: "workflow", key: w.key, meta: { inputs: w.inputs, target: w.meta.target } })),
        });
        nodes.push({ id: "inbox", label: "Inbox", kind: "folder", children: await this.dirTree(ref.root, p.inbox, DIRS.inbox) });
        nodes.push({ id: "dailies", label: "Dailies", kind: "folder", children: await this.dirTree(ref.root, p.dailies, DIRS.dailies) });
        nodes.push({ id: "delivery", label: "Delivery", kind: "folder", children: await this.dirTree(ref.root, p.delivery, DIRS.delivery) });
        return nodes;
    }

    private async dirTree(root: string, dir: string, prefix: string): Promise<TreeNode[]> {
        if (!(await exists(dir))) return [];
        const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith("."));
        const out: TreeNode[] = [];
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const key = `${prefix}/${e.name}`;
            if (e.isDirectory()) {
                out.push({ id: key, label: e.name, kind: "folder", key, children: await this.dirTree(root, join(dir, e.name), key) });
            } else {
                const st = await stat(join(dir, e.name));
                out.push({
                    id: key,
                    label: e.name,
                    kind: isWorkflowKey(key) ? "workflow" : "file",
                    key,
                    meta: { size: st.size, mtime: st.mtime.toISOString(), modality: modalityOfExt(e.name.split(".").pop() ?? "") },
                });
            }
        }
        return out;
    }

    toKey(projectRoot: string, abs: string): string {
        return toProjectKey(projectRoot, abs);
    }
}

export { isEpisodeId };
