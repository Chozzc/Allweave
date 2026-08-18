/**
 * HTTP routes on dsh's web server, under `<prefix>` (default `/tongflow`):
 *
 *   Studio API (JSON)              /tongflow/projects, /tongflow/p/:pid/…, /tongflow/runs/…, /tongflow/plugins…
 *   Files (Range)                  /tongflow/p/:pid/files/<key>   ·  /tongflow/p/:pid/ref?ref=tf://…
 *   Canvas-compat API              /tongflow/p/:pid/api/…  — what `tongflow/canvas` calls when its
 *                                  apiBaseUrl is `/tongflow/p/:pid` (task create/wait/stop, plugins registry,
 *                                  upload, uploads, material stubs).
 */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { TaskStatus } from "tongflow";
import type { StudioApi } from "../api.ts";
import type { RunRecord } from "../engine/runs.ts";
import type { CanvasTaskBody } from "../engine/single-node.ts";
import { DIRS, fromProjectKey, toProjectKey } from "../project/paths.ts";
import type {
    EpisodeBreakdown,
    Pass,
    RunEvent,
    RunSummary,
    WorkflowFileMeta,
} from "../shared/types.ts";
import type { Studio } from "../studio.ts";
import { exists, writeFileAtomic } from "../util/fsx.ts";
import { serveFile } from "./files.ts";
import { openSse } from "./sse.ts";
import {
    assertSameOrigin,
    compileRoute,
    HttpError,
    type Route,
    type RouteContext,
    readFormData,
    readJson,
    sendError,
    sendJson,
} from "./util.ts";

export interface RouteEnv {
    studio: Studio;
    api: StudioApi;
    prefix: string;
}

export function registerRoutes(ctx: Context, env: RouteEnv): void {
    const prefix = env.prefix.replace(/\/+$/, "") || "/tongflow";
    const routes = buildRoutes(env).map(compileRoute);
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const path = url.pathname.slice(prefix.length) || "/";
        const method = req.method ?? "GET";
        try {
            for (const { route, match } of routes) {
                if (
                    route.method !== method &&
                    !(route.method === "GET" && method === "HEAD")
                )
                    continue;
                const m = match(path);
                if (!m) continue;
                if (method !== "GET" && method !== "HEAD")
                    assertSameOrigin(req);
                await route.handler({
                    req,
                    res,
                    url,
                    params: m.params,
                    rest: m.rest,
                });
                return;
            }
            sendJson(res, 404, { error: `no route for ${method} ${path}` });
        } catch (error) {
            if (!res.headersSent) sendError(res, error);
            else res.end();
        }
    };
    ctx.effect(
        () => ctx.webServer.register({ kind: "prefix", path: prefix, handler }),
        "dsh-tongflow: http routes",
    );
}

function q(url: URL, name: string): string | undefined {
    const v = url.searchParams.get(name);
    return v === null ? undefined : v;
}

function requireQ(url: URL, name: string): string {
    const v = q(url, name);
    if (!v) throw new HttpError(400, `missing query parameter "${name}"`);
    return v;
}

function buildRoutes(env: RouteEnv): Route[] {
    const { api, studio } = env;
    const json = (c: RouteContext, body: unknown, status = 200) =>
        sendJson(c.res, status, body);

    return [
        /* ---------------- health / config ---------------- */
        {
            method: "GET",
            pattern: "/health",
            handler: async (c) => {
                let python: string | undefined;
                let error: string | undefined;
                try {
                    python = await studio.python();
                } catch (e) {
                    error = e instanceof Error ? e.message : String(e);
                }
                json(c, {
                    ok: !error,
                    studioRoot: studio.paths.root,
                    python,
                    sdkSpec: studio.config.sdkSpec,
                    locale: studio.config.locale,
                    ...(error ? { error } : {}),
                });
            },
        },

        {
            method: "GET",
            pattern: "/env",
            handler: async (c) => {
                const stored = await studio.readEnvFile();
                const { meta } = await api.registry();
                const wanted = new Map<
                    string,
                    {
                        plugins: string[];
                        required: boolean;
                        description?: string;
                        url?: string;
                    }
                >();
                for (const [pid, m] of Object.entries(meta)) {
                    for (const e of m.env) {
                        const w = wanted.get(e.key) ?? {
                            plugins: [],
                            required: false,
                        };
                        w.plugins.push(pid);
                        w.required = w.required || Boolean(e.required);
                        if (e.description) w.description = e.description;
                        if (e.url) w.url = e.url;
                        wanted.set(e.key, w);
                    }
                }
                const keys = [...wanted.entries()].map(([key, w]) => ({
                    key,
                    ...w,
                    set: Boolean(
                        stored[key] ||
                            studio.config.env[key] ||
                            process.env[key],
                    ),
                    source: stored[key]
                        ? "studio"
                        : studio.config.env[key]
                          ? "config"
                          : process.env[key]
                            ? "process"
                            : undefined,
                }));
                for (const key of Object.keys(stored))
                    if (!wanted.has(key))
                        keys.push({
                            key,
                            plugins: [],
                            required: false,
                            set: true,
                            source: "studio",
                        });
                json(c, { keys });
            },
        },
        {
            method: "PUT",
            pattern: "/env",
            handler: async (c) => {
                const body = await readJson<Record<string, string | null>>(
                    c.req,
                );
                const saved = await studio.updateEnvFile(body);
                json(c, { keys: Object.keys(saved) });
            },
        },

        /* ---------------- projects ---------------- */
        {
            method: "GET",
            pattern: "/templates",
            handler: async (c) => json(c, await api.listTemplates()),
        },
        {
            method: "GET",
            pattern: "/projects",
            handler: async (c) => json(c, await api.listProjects()),
        },
        {
            method: "POST",
            pattern: "/projects",
            handler: async (c) => {
                const body = await readJson<{
                    title?: string;
                    template?: string;
                    logline?: string;
                    id?: string;
                }>(c.req);
                if (!body.title || !body.template)
                    throw new HttpError(400, "title and template are required");
                json(
                    c,
                    await api.createProject({
                        title: body.title,
                        template: body.template,
                        ...(body.logline ? { logline: body.logline } : {}),
                        ...(body.id ? { id: body.id } : {}),
                    }),
                    201,
                );
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid",
            handler: async (c) =>
                json(c, await api.projectSummary(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/status",
            handler: async (c) => json(c, await api.status(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/tree",
            handler: async (c) => json(c, await api.tree(c.params.pid)),
        },

        /* ---------------- bible ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/entities",
            handler: async (c) => json(c, await api.listEntities(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/entities/:id",
            handler: async (c) => {
                const e = await api.getEntity(c.params.pid, c.params.id);
                if (!e)
                    throw new HttpError(404, `entity ${c.params.id} not found`);
                json(c, e);
            },
        },
        {
            method: "PUT",
            pattern: "/p/:pid/entities/:id",
            handler: async (c) => {
                const body = await readJson<{
                    card?: string;
                    consistency?: Record<string, unknown>;
                }>(c.req);
                json(
                    c,
                    await api.upsertEntity(c.params.pid, {
                        id: c.params.id,
                        ...(body.card !== undefined ? { card: body.card } : {}),
                        ...(body.consistency
                            ? { consistency: body.consistency }
                            : {}),
                    }),
                );
            },
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/entities/:id",
            handler: async (c) => {
                await api.deleteEntity(c.params.pid, c.params.id);
                json(c, { ok: true });
            },
        },

        /* ---------------- breakdown ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/breakdown/:ep",
            handler: async (c) => {
                const bd = await api.getBreakdown(c.params.pid, c.params.ep);
                if (!bd)
                    throw new HttpError(404, `no breakdown for ${c.params.ep}`);
                json(c, {
                    breakdown: bd,
                    status: await api.shotStatuses(c.params.pid, c.params.ep),
                });
            },
        },
        {
            method: "PUT",
            pattern: "/p/:pid/breakdown/:ep",
            handler: async (c) => {
                const body = await readJson<EpisodeBreakdown>(c.req);
                json(
                    c,
                    await api.setBreakdown(c.params.pid, {
                        ...body,
                        episode: c.params.ep,
                    }),
                );
            },
        },

        /* ---------------- takes ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/takes/:owner",
            handler: async (c) =>
                json(c, await api.allTakes(c.params.pid, c.params.owner)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/takes/:owner/:pass",
            handler: async (c) =>
                json(
                    c,
                    await api.listTakes(
                        c.params.pid,
                        c.params.owner,
                        c.params.pass as Pass,
                    ),
                ),
        },
        {
            method: "POST",
            pattern: "/p/:pid/takes/:owner/:pass/:take/circle",
            handler: async (c) =>
                json(
                    c,
                    await api.circleTake(
                        c.params.pid,
                        c.params.owner,
                        c.params.pass as Pass,
                        c.params.take,
                    ),
                ),
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/takes/:owner/:pass/:take",
            handler: async (c) => {
                await api.deleteTake(
                    c.params.pid,
                    c.params.owner,
                    c.params.pass as Pass,
                    c.params.take,
                );
                json(c, { ok: true });
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/notes",
            handler: async (c) => {
                const body = await readJson<{
                    subject?: string;
                    text?: string;
                }>(c.req);
                if (!body.subject || !body.text)
                    throw new HttpError(400, "subject and text are required");
                json(c, {
                    key: await api.addNote(
                        c.params.pid,
                        body.subject,
                        body.text,
                    ),
                });
            },
        },

        /* ---------------- workflows ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/workflows",
            handler: async (c) =>
                json(c, await api.listWorkflows(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow",
            handler: async (c) =>
                json(
                    c,
                    await api.readWorkflow(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },
        {
            method: "PUT",
            pattern: "/p/:pid/workflow",
            handler: async (c) => {
                const key = requireQ(c.url, "key");
                const doc = await readJson<
                    Parameters<StudioApi["saveWorkflowDocument"]>[2]
                >(c.req);
                json(c, await api.saveWorkflowDocument(c.params.pid, key, doc));
            },
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/workflow",
            handler: async (c) => {
                await api.deleteWorkflow(c.params.pid, requireQ(c.url, "key"));
                json(c, { ok: true });
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/workflows",
            handler: async (c) => {
                const body = await readJson<{
                    path?: string;
                    fromTemplate?: string;
                    name?: string;
                    description?: string;
                    meta?: WorkflowFileMeta;
                }>(c.req);
                if (!body.path) throw new HttpError(400, "path is required");
                json(
                    c,
                    await api.newWorkflow(c.params.pid, body.path, body),
                    201,
                );
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/workflow/bind",
            handler: async (c) => {
                const key = requireQ(c.url, "key");
                const body = await readJson<
                    Partial<WorkflowFileMeta> & { unbind?: string[] }
                >(c.req);
                json(c, await api.bindWorkflow(c.params.pid, key, body));
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/workflow/patch",
            handler: async (c) => {
                const key = requireQ(c.url, "key");
                const patch = await readJson<Record<string, unknown>>(c.req);
                json(
                    c,
                    await api.graphTool(
                        c.params.pid,
                        key,
                        "apply_graph_patch",
                        patch,
                    ),
                );
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow/describe",
            handler: async (c) =>
                json(
                    c,
                    await api.describeWorkflow(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },

        /* ---------------- runs ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/runs",
            handler: async (c) => json(c, api.listRuns(c.params.pid)),
        },
        {
            method: "POST",
            pattern: "/p/:pid/runs",
            handler: async (c) => {
                const body = await readJson<{
                    workflowKey?: string;
                    inputs?: Record<string, unknown>;
                    target?: { owner: string; pass: Pass };
                    note?: string;
                }>(c.req);
                if (!body.workflowKey)
                    throw new HttpError(400, "workflowKey is required");
                const record = await api.startRun({
                    projectId: c.params.pid,
                    ...body,
                });
                json(c, record.summary, 202);
            },
        },
        {
            method: "GET",
            pattern: "/runs/:runId",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                json(c, r.summary);
            },
        },
        {
            method: "GET",
            pattern: "/runs/:runId/events",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                streamRun(c, r, (event, summary) => ({ event, summary }));
            },
        },
        {
            method: "POST",
            pattern: "/runs/:runId/cancel",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                r.cancel("cancelled from studio");
                json(c, { ok: true });
            },
        },

        /* ---------------- plugins ---------------- */
        {
            method: "GET",
            pattern: "/plugins",
            handler: async (c) => {
                const { registry, meta, scannedAt } = await api.registry();
                const { OFFICIAL_PLUGINS } = await import(
                    "../engine/registry.ts"
                );
                json(c, {
                    registry,
                    meta,
                    scannedAt,
                    official: OFFICIAL_PLUGINS,
                });
            },
        },
        {
            method: "POST",
            pattern: "/plugins/install",
            handler: async (c) => {
                const body = await readJson<{ idOrUrl?: string }>(c.req);
                if (!body.idOrUrl)
                    throw new HttpError(400, "idOrUrl is required");
                json(c, await api.installPlugin(body.idOrUrl));
            },
        },
        {
            method: "DELETE",
            pattern: "/plugins/:id",
            handler: async (c) => {
                await api.uninstallPlugin(c.params.id);
                json(c, { ok: true });
            },
        },
        {
            method: "POST",
            pattern: "/plugins/update",
            handler: async (c) =>
                json(c, { changed: await api.updatePlugins() }),
        },
        {
            method: "GET",
            pattern: "/catalog",
            handler: async (c) => json(c, { catalog: await api.nodeCatalog() }),
        },

        /* ---------------- files ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/files/*",
            handler: async (c) =>
                serveFile(
                    c.req,
                    c.res,
                    await api.filePath(c.params.pid, c.rest),
                ),
        },
        {
            method: "PUT",
            pattern: "/p/:pid/files/*",
            handler: async (c) => {
                const buf = await (await import("./util.ts")).readBody(c.req);
                const abs = await api.filePath(c.params.pid, c.rest);
                await writeFileAtomic(abs, buf);
                json(c, { ok: true, key: c.rest });
            },
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/files/*",
            handler: async (c) => {
                await unlink(await api.filePath(c.params.pid, c.rest));
                json(c, { ok: true });
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/ref",
            handler: async (c) => {
                const r = await api.resolveRef(
                    c.params.pid,
                    requireQ(c.url, "ref"),
                );
                if (r.kind === "texts") {
                    json(c, { kind: "texts", texts: r.texts });
                    return;
                }
                if (r.paths.length !== 1) {
                    json(c, { kind: "files", keys: r.keys });
                    return;
                }
                await serveFile(c.req, c.res, r.paths[0]);
            },
        },

        /* ---------------- canvas-compat (`tongflow/canvas` with apiBaseUrl=/tongflow/p/:pid) ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/api/plugins/registry",
            handler: async (c) => json(c, (await api.registry()).registry),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/create",
            handler: async (c) => {
                const body = await readJson<CanvasTaskBody>(c.req);
                if (!body.feature || !body.pluginId)
                    throw new HttpError(
                        400,
                        "feature and pluginId are required",
                    );
                const record = await api.startCanvasRun(c.params.pid, body);
                json(c, { taskId: record.summary.runId });
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/task/wait",
            handler: async (c) => {
                const taskId = requireQ(c.url, "taskId");
                const r = api.getRun(taskId);
                if (!r) throw new HttpError(404, "unknown task");
                const nodeId = r.summary.workflow.startsWith("canvas ")
                    ? canvasNodeId(r)
                    : null;
                streamRun(c, r, (event, summary) =>
                    canvasFrame(taskId, nodeId, event, summary, r),
                );
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/stop",
            handler: async (c) => {
                const body = await readJson<{ taskId?: string }>(c.req);
                const r = body.taskId ? api.getRun(body.taskId) : undefined;
                if (!r) throw new HttpError(404, "unknown task");
                const wasRunning =
                    r.summary.status === "running" ||
                    r.summary.status === "queued";
                r.cancel("stopped from canvas");
                json(c, { status: "cancelled", wasRunning });
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/update-status",
            handler: async (c) => json(c, { success: true, skipped: true }),
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/task/list",
            handler: async (c) => json(c, { tasks: [] }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/upload",
            handler: async (c) => {
                const form = await readFormData(c.req);
                const file = form.get("file");
                if (!(file instanceof File))
                    throw new HttpError(
                        400,
                        "multipart field 'file' is required",
                    );
                const ref = await api.project(c.params.pid);
                const dir = join(ref.root, DIRS.inbox);
                await mkdir(dir, { recursive: true });
                const safe =
                    basename(file.name || "upload").replace(
                        /[^A-Za-z0-9._-]+/g,
                        "_",
                    ) || "upload";
                let dest = join(dir, safe);
                if (await exists(dest)) {
                    const ext = extname(safe);
                    dest = join(
                        dir,
                        `${safe.slice(0, safe.length - ext.length)}-${Date.now().toString(36)}${ext}`,
                    );
                }
                await writeFile(dest, Buffer.from(await file.arrayBuffer()));
                const key = toProjectKey(ref.root, dest);
                json(c, {
                    fileKey: key,
                    url: `${env.prefix}/p/${c.params.pid}/files/${key}`,
                    size: file.size,
                    name: file.name,
                });
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/uploads/*",
            handler: async (c) =>
                serveFile(
                    c.req,
                    c.res,
                    await api.filePath(c.params.pid, c.rest),
                ),
        },
        // Material library: not part of the studio (takes are the library). Keep the canvas quiet.
        {
            method: "GET",
            pattern: "/p/:pid/api/material",
            handler: async (c) => json(c, { materials: [], total: 0 }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/material",
            handler: async (c) => json(c, { id: 0 }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/material/save-from-task",
            handler: async (c) => json(c, { saved: false }),
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/feature/list",
            handler: async (c) => json(c, { features: [] }),
        },
    ];
}

/* ---------------- run streaming ---------------- */

function streamRun<T>(
    c: RouteContext,
    r: RunRecord,
    map: (event: RunEvent, summary: RunSummary) => T | undefined,
): void {
    const sse = openSse(c.req, c.res);
    const send = (event: RunEvent, summary: RunSummary) => {
        const frame = map(event, summary);
        if (frame !== undefined) sse.send(frame);
    };
    for (const e of r.events) send(e, r.summary);
    if (r.summary.finishedAt) {
        sse.close();
        return;
    }
    const off = r.subscribe(send);
    void r.done.then(() => {
        off();
        setTimeout(() => sse.close(), 50);
    });
    c.req.on("close", off);
}

function canvasNodeId(r: RunRecord): string | null {
    const doc = r.outcome?.result ? undefined : undefined;
    void doc;
    const first = Object.keys(r.summary.nodes)[0];
    return first ?? null;
}

/** Translate a run event into the SSE envelope `tongflow/canvas` expects. */
function canvasFrame(
    taskId: string,
    nodeIdHint: string | null,
    event: RunEvent,
    summary: RunSummary,
    r: RunRecord,
) {
    const nodeId =
        event.nodeId ?? nodeIdHint ?? Object.keys(summary.nodes)[0] ?? null;
    switch (event.type) {
        case "log":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: { message: event.message },
            };
        case "workflow_started":
        case "node_started":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: { message: event.label ?? "started" },
            };
        case "plugin_progress":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: {
                    message: event.message,
                    ...(event.percent !== undefined
                        ? { progress: event.percent }
                        : {}),
                },
            };
        case "node_failed":
            return {
                id: taskId,
                status: TaskStatus.FAILED,
                nodeId,
                data: { error: event.error },
            };
        case "workflow_failed":
        case "error":
            return {
                id: taskId,
                status:
                    summary.status === "cancelled"
                        ? TaskStatus.CANCELLED
                        : TaskStatus.FAILED,
                nodeId,
                data: { error: event.error ?? summary.error },
            };
        case "ingested": {
            const outputs = event.outputs ?? r.outcome?.result.outputs ?? {};
            const raw =
                (nodeId && outputs[nodeId]) || Object.values(outputs)[0] || {};
            return {
                id: taskId,
                status: TaskStatus.COMPLETED,
                nodeId,
                data: raw,
            };
        }
        default:
            return undefined;
    }
}

export { fromProjectKey };
