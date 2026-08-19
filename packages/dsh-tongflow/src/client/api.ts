/** Same-origin client for the plugin's HTTP routes (`/tongflow/…`). */
import type {
    EntityDetail,
    EntitySummary,
    EpisodeBreakdown,
    Pass,
    ProjectSummary,
    RunEvent,
    RunSummary,
    TakeInfo,
    TreeNode,
    WorkflowFileMeta,
    WorkflowSummary,
} from "../shared/types.ts";

export const PREFIX = "/tongflow";

async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    raw?: BodyInit,
): Promise<T> {
    const res = await fetch(`${PREFIX}${path}`, {
        method,
        headers:
            body !== undefined
                ? { "content-type": "application/json" }
                : undefined,
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
        credentials: "same-origin",
    });
    const text = await res.text();
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        data = text;
    }
    if (!res.ok) {
        const message =
            (data as { error?: string } | undefined)?.error ??
            `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return data as T;
}

export interface TemplateInfo {
    id: string;
    title: string;
    description: string;
}

export interface Health {
    ok: boolean;
    studioRoot: string;
    python?: string;
    sdkSpec: string;
    locale: string;
    error?: string;
}

export interface WorkflowDoc {
    name: string;
    description?: string;
    flow: { nodes: unknown[]; edges: unknown[] };
    executable?: {
        inputs?: { name: string; type: string; required: boolean }[];
        outputs?: { name: string; type: string }[];
    };
    exportError?: string;
    meta: WorkflowFileMeta;
}

export const studio = {
    health: () => call<Health>("GET", "/health"),
    sessionProject: (sid: string) =>
        call<{ project: string | null }>(
            "GET",
            `/session/${encodeURIComponent(sid)}/project`,
        ),
    templates: (locale?: string) =>
        call<TemplateInfo[]>(
            "GET",
            `/templates${locale ? `?locale=${encodeURIComponent(locale)}` : ""}`,
        ),
    projects: () => call<ProjectSummary[]>("GET", "/projects"),
    createProject: (body: {
        title: string;
        template: string;
        logline?: string;
        locale?: string;
    }) => call<ProjectSummary>("POST", "/projects", body),
    project: (pid: string) => call<ProjectSummary>("GET", `/p/${pid}`),
    tree: (pid: string) => call<TreeNode[]>("GET", `/p/${pid}/tree`),
    entities: (pid: string) =>
        call<EntitySummary[]>("GET", `/p/${pid}/entities`),
    entity: (pid: string, id: string) =>
        call<EntityDetail>("GET", `/p/${pid}/entities/${id}`),
    upsertEntity: (
        pid: string,
        id: string,
        body: { card?: string; consistency?: Record<string, unknown> },
    ) => call<EntityDetail>("PUT", `/p/${pid}/entities/${id}`, body),
    breakdown: (pid: string, ep: string) =>
        call<{ breakdown: EpisodeBreakdown; status: unknown[] }>(
            "GET",
            `/p/${pid}/breakdown/${ep}`,
        ),
    takes: (pid: string, owner: string) =>
        call<Record<string, TakeInfo[]>>("GET", `/p/${pid}/takes/${owner}`),
    circle: (pid: string, owner: string, pass: Pass, take: string) =>
        call<TakeInfo>(
            "POST",
            `/p/${pid}/takes/${owner}/${pass}/${take}/circle`,
        ),
    deleteTake: (pid: string, owner: string, pass: Pass, take: string) =>
        call<{ ok: true }>(
            "DELETE",
            `/p/${pid}/takes/${owner}/${pass}/${take}`,
        ),
    workflows: (pid: string) =>
        call<WorkflowSummary[]>("GET", `/p/${pid}/workflows`),
    workflow: (pid: string, key: string) =>
        call<WorkflowDoc>(
            "GET",
            `/p/${pid}/workflow?key=${encodeURIComponent(key)}`,
        ),
    saveWorkflow: (pid: string, key: string, doc: WorkflowDoc) =>
        call<WorkflowSummary>(
            "PUT",
            `/p/${pid}/workflow?key=${encodeURIComponent(key)}`,
            doc,
        ),
    newWorkflow: (
        pid: string,
        body: { path: string; fromTemplate?: string; name?: string },
    ) => call<WorkflowSummary>("POST", `/p/${pid}/workflows`, body),
    bindWorkflow: (
        pid: string,
        key: string,
        body: Partial<WorkflowFileMeta> & { unbind?: string[] },
    ) =>
        call<WorkflowSummary>(
            "POST",
            `/p/${pid}/workflow/bind?key=${encodeURIComponent(key)}`,
            body,
        ),
    describeWorkflow: (pid: string, key: string) =>
        call<Record<string, unknown>>(
            "GET",
            `/p/${pid}/workflow/describe?key=${encodeURIComponent(key)}`,
        ),
    compose: (pid: string, owner: string) =>
        call<{
            key: string;
            links: number;
            unlinked: string[];
            nodeCount: number;
        }>("POST", `/p/${pid}/compose`, { owner }),
    runs: (pid: string) => call<RunSummary[]>("GET", `/p/${pid}/runs`),
    startRun: (
        pid: string,
        body: {
            workflowKey: string;
            inputs?: Record<string, unknown>;
            target?: { owner: string; pass: Pass };
            note?: string;
        },
    ) => call<RunSummary>("POST", `/p/${pid}/runs`, body),
    run: (runId: string) => call<RunSummary>("GET", `/runs/${runId}`),
    cancelRun: (runId: string) =>
        call<{ ok: true }>("POST", `/runs/${runId}/cancel`),
    readText: async (pid: string, key: string) => {
        const res = await fetch(fileUrl(pid, key), {
            credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
    },
    writeText: (pid: string, key: string, text: string) =>
        call<{ ok: true }>(
            "PUT",
            `/p/${pid}/files/${encodeKey(key)}`,
            undefined,
            text,
        ),
    plugins: () =>
        call<{
            registry: {
                nodePluginMap: Record<string, string[]>;
                plugins: Record<
                    string,
                    {
                        name?: string;
                        description?: string;
                        methodsByNodeSlot: Record<string, unknown>;
                    }
                >;
            };
            meta: Record<
                string,
                {
                    env: {
                        key: string;
                        required?: boolean;
                        description?: string;
                        url?: string;
                    }[];
                }
            >;
            official: string[];
        }>("GET", "/plugins"),
    installPlugin: (idOrUrl: string) =>
        call<{ id: string; alreadyInstalled: boolean }>(
            "POST",
            "/plugins/install",
            { idOrUrl },
        ),
    uninstallPlugin: (id: string) =>
        call<{ ok: true }>("DELETE", `/plugins/${id}`),
};

export function encodeKey(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
}

export function fileUrl(pid: string, key: string): string {
    if (key.startsWith("tf://"))
        return `${PREFIX}/p/${pid}/ref?ref=${encodeURIComponent(key)}`;
    if (/^(https?:|data:|blob:)/.test(key)) return key;
    return `${PREFIX}/p/${pid}/files/${encodeKey(key.replace(/^\//, ""))}`;
}

/** Subscribe to a run's SSE stream; returns an unsubscribe function. */
export function subscribeRun(
    runId: string,
    onFrame: (frame: { event: RunEvent; summary: RunSummary }) => void,
    onEnd?: () => void,
): () => void {
    const es = new EventSource(`${PREFIX}/runs/${runId}/events`);
    es.onmessage = (e) => {
        try {
            onFrame(JSON.parse(e.data));
        } catch {
            // ignore
        }
    };
    es.onerror = () => {
        es.close();
        onEnd?.();
    };
    return () => es.close();
}
