import type { Edge, Node } from "@xyflow/react";
import type { ExecutableWorkflow } from "tongflow";
import type { Material, MaterialType, TaskRecord } from "tongflow/canvas";
import { buildWorkflowTemplates } from "@/lib/workflow-templates";

const DB_NAME = "allweave";
const DB_VERSION = 2;
const WORKFLOWS = "workflows";
const WORKSPACE = "workspace";
const TASKS = "tasks";
const MATERIALS = "materials";
const SETTINGS = "settings";
const CURRENT_DRAFT = "current";
const ENV_SETTINGS = "env";
const TEMPLATES_SEEDED = "workflow-templates-v2";

export interface BrowserWorkflow {
    id: number;
    name: string;
    description?: string;
    flow: string;
    executable?: string;
    cover?: string | null;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
    templateKey?: string;
}

export interface WorkspaceDraft {
    nodes: Node[];
    edges: Edge[];
    meta: {
        id: number | null;
        name: string;
        description: string;
    };
}

interface StoredDraft extends WorkspaceDraft {
    key: typeof CURRENT_DRAFT;
}

interface StoredSettings {
    key: typeof ENV_SETTINGS;
    value: Record<string, string>;
}

interface StoredMaterial extends Material {
    sourceKey?: string;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(WORKFLOWS)) {
                db.createObjectStore(WORKFLOWS, {
                    keyPath: "id",
                    autoIncrement: true,
                });
            }
            if (!db.objectStoreNames.contains(WORKSPACE)) {
                db.createObjectStore(WORKSPACE, { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains(TASKS)) {
                db.createObjectStore(TASKS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(MATERIALS)) {
                db.createObjectStore(MATERIALS, {
                    keyPath: "id",
                    autoIncrement: true,
                });
            }
            if (!db.objectStoreNames.contains(SETTINGS)) {
                db.createObjectStore(SETTINGS, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDatabase();
    return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = operation(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function loadWorkspaceDraft(): Promise<WorkspaceDraft | null> {
    const draft = await withStore<StoredDraft | undefined>(
        WORKSPACE,
        "readonly",
        (store) => store.get(CURRENT_DRAFT),
    );
    if (!draft) return null;
    return { nodes: draft.nodes, edges: draft.edges, meta: draft.meta };
}

export async function saveWorkspaceDraft(draft: WorkspaceDraft): Promise<void> {
    await withStore<IDBValidKey>(WORKSPACE, "readwrite", (store) =>
        store.put({ key: CURRENT_DRAFT, ...draft }),
    );
}

export async function saveBrowserWorkflow(data: {
    workflowId?: number;
    name: string;
    description?: string;
    flow: Record<string, unknown>;
    executable?: ExecutableWorkflow;
}): Promise<number> {
    const now = new Date();
    if (data.workflowId) {
        const current = await getBrowserWorkflow(data.workflowId);
        const workflow: BrowserWorkflow = {
            ...current,
            id: data.workflowId,
            name: data.name,
            description: data.description,
            flow: JSON.stringify(data.flow),
            executable: data.executable
                ? JSON.stringify(data.executable)
                : current?.executable,
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
            deleted: false,
        };
        await withStore<IDBValidKey>(WORKFLOWS, "readwrite", (store) =>
            store.put(workflow),
        );
        return data.workflowId;
    }

    const workflow = {
        name: data.name,
        description: data.description,
        flow: JSON.stringify(data.flow),
        executable: data.executable
            ? JSON.stringify(data.executable)
            : undefined,
        cover: null,
        createdAt: now,
        updatedAt: now,
        deleted: false,
    };
    return Number(
        await withStore<IDBValidKey>(WORKFLOWS, "readwrite", (store) =>
            store.add(workflow),
        ),
    );
}

export async function listBrowserWorkflows(): Promise<BrowserWorkflow[]> {
    await ensureWorkflowTemplates();
    const workflows = await withStore<BrowserWorkflow[]>(
        WORKFLOWS,
        "readonly",
        (store) => store.getAll(),
    );
    return workflows
        .filter((workflow) => !workflow.deleted)
        .sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        );
}

async function ensureWorkflowTemplates(): Promise<void> {
    const seeded = await withStore<{ value: boolean } | undefined>(
        SETTINGS,
        "readonly",
        (store) => store.get(TEMPLATES_SEEDED),
    );
    if (seeded?.value) return;

    const now = new Date();
    const existingWorkflows = await withStore<BrowserWorkflow[]>(
        WORKFLOWS,
        "readonly",
        (store) => store.getAll(),
    );
    for (const template of buildWorkflowTemplates()) {
        const existing = existingWorkflows.find(
            (workflow) => workflow.templateKey === template.key,
        );
        const next = {
            ...(existing ?? {
                cover: null,
                createdAt: now,
                deleted: false,
            }),
            name: template.name,
            description: template.description,
            flow: JSON.stringify({
                nodes: template.nodes,
                edges: template.edges,
            }),
            executable: JSON.stringify(template.executable),
            updatedAt: now,
            templateKey: template.key,
        };
        await withStore<IDBValidKey>(WORKFLOWS, "readwrite", (store) =>
            existing ? store.put(next) : store.add(next),
        );
    }
    await withStore<IDBValidKey>(SETTINGS, "readwrite", (store) =>
        store.put({ key: TEMPLATES_SEEDED, value: true }),
    );
}

export async function getBrowserWorkflow(
    id: number,
): Promise<BrowserWorkflow | undefined> {
    return await withStore<BrowserWorkflow | undefined>(
        WORKFLOWS,
        "readonly",
        (store) => store.get(id),
    );
}

export async function deleteBrowserWorkflow(id: number): Promise<void> {
    await withStore<undefined>(WORKFLOWS, "readwrite", (store) =>
        store.delete(id),
    );
}

export async function loadBrowserEnv(): Promise<Record<string, string> | null> {
    const settings = await withStore<StoredSettings | undefined>(
        SETTINGS,
        "readonly",
        (store) => store.get(ENV_SETTINGS),
    );
    return settings?.value ?? null;
}

/** Browser values win because this build deliberately makes IndexedDB user-owned. */
export function mergeBrowserEnv(
    serverEnv: Record<string, string>,
    browserEnv: Record<string, string> | null,
): Record<string, string> {
    return { ...serverEnv, ...(browserEnv ?? {}) };
}

export async function saveBrowserEnv(
    value: Record<string, string>,
): Promise<void> {
    await withStore<IDBValidKey>(SETTINGS, "readwrite", (store) =>
        store.put({ key: ENV_SETTINGS, value }),
    );
}

/** Merge focused credential edits into the browser-owned settings copy. */
export async function patchBrowserEnv(
    patch: Record<string, string>,
): Promise<void> {
    const next = { ...((await loadBrowserEnv()) ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
        if (value.trim()) next[key] = value;
        else delete next[key];
    }
    await saveBrowserEnv(next);
}

export async function saveBrowserTask(task: TaskRecord): Promise<void> {
    await withStore<IDBValidKey>(TASKS, "readwrite", (store) =>
        store.put(task),
    );
}

export async function listBrowserTasks(
    page = 1,
    pageSize = 20,
): Promise<{ tasks: TaskRecord[] }> {
    const all = await withStore<TaskRecord[]>(TASKS, "readonly", (store) =>
        store.getAll(),
    );
    const start = (page - 1) * pageSize;
    return {
        tasks: all
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            )
            .slice(start, start + pageSize),
    };
}

function taskStatus(status: string): TaskRecord["status"] {
    const normalized = status.toUpperCase();
    if (normalized.includes("CANCEL")) return "cancelled";
    if (normalized.includes("FAIL")) return "failed";
    if (normalized.includes("COMPLETED")) return "completed";
    if (normalized.includes("START") || normalized.includes("RUN")) {
        return "processing";
    }
    return "pending";
}

function materialType(fileKey: string): MaterialType {
    const extension = fileKey.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? ""))
        return "image";
    if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "")) return "video";
    if (["mp3", "wav", "m4a", "ogg", "flac"].includes(extension ?? ""))
        return "audio";
    if (["glb", "gltf", "obj", "fbx"].includes(extension ?? "")) return "model";
    return "file";
}

function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

async function saveOutputMaterials(
    taskId: string,
    nodeId: string,
    output: Record<string, unknown>,
): Promise<void> {
    const existing = await withStore<StoredMaterial[]>(
        MATERIALS,
        "readonly",
        (store) => store.getAll(),
    );
    const sourceKeys = new Set(existing.map((item) => item.sourceKey));
    const fileKeys = [
        ...strings(output.fileKeys),
        ...strings(output.file_keys),
        ...strings(output.fileKey),
        ...strings(output.file_key),
    ];
    const texts = [...strings(output.texts), ...strings(output.text)];
    const now = new Date();

    for (const fileKey of new Set(fileKeys)) {
        const sourceKey = `${taskId}:${nodeId}:file:${fileKey}`;
        if (sourceKeys.has(sourceKey)) continue;
        const type = materialType(fileKey);
        await withStore<IDBValidKey>(MATERIALS, "readwrite", (store) =>
            store.add({
                name: fileKey.split("/").pop() || `${nodeId} result`,
                type,
                content: { fileKeys: [fileKey] },
                thumbnail:
                    type === "image" || type === "video" ? fileKey : undefined,
                isFavorite: false,
                isCover: false,
                createdAt: now,
                updatedAt: now,
                deleted: false,
                sourceKey,
            }),
        );
    }

    if (texts.length > 0) {
        const sourceKey = `${taskId}:${nodeId}:text:${texts.join("\n")}`;
        if (!sourceKeys.has(sourceKey)) {
            await withStore<IDBValidKey>(MATERIALS, "readwrite", (store) =>
                store.add({
                    name: `${nodeId} text result`,
                    type: "text",
                    content: { texts },
                    isFavorite: false,
                    isCover: false,
                    createdAt: now,
                    updatedAt: now,
                    deleted: false,
                    sourceKey,
                }),
            );
        }
    }
}

export async function recordBrowserTaskEvent(
    taskId: string,
    status: string,
    nodeId: string | null | undefined,
    data?: Record<string, unknown>,
): Promise<void> {
    const current = await withStore<TaskRecord | undefined>(
        TASKS,
        "readonly",
        (store) => store.get(taskId),
    );
    const now = new Date();
    const nextStatus = taskStatus(status);
    await saveBrowserTask({
        id: taskId,
        nodeId: nodeId ?? current?.nodeId ?? "workflow",
        feature: current?.feature ?? "workflow",
        prompt: current?.prompt ?? {},
        status: nextStatus,
        progress:
            typeof data?.progress === "number"
                ? data.progress
                : nextStatus === "completed"
                  ? 100
                  : (current?.progress ?? 0),
        result: data?.output ?? data ?? current?.result,
        error:
            nextStatus === "failed"
                ? String(data?.error ?? data?.message ?? "Task failed")
                : current?.error,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
    });

    if (status.toUpperCase().includes("NODE_COMPLETED") && data?.output) {
        await saveOutputMaterials(
            taskId,
            nodeId ?? "node",
            data.output as Record<string, unknown>,
        );
    }
}

export async function listBrowserMaterials(
    type?: MaterialType,
): Promise<{ materials: Material[] }> {
    const all = await withStore<StoredMaterial[]>(
        MATERIALS,
        "readonly",
        (store) => store.getAll(),
    );
    return {
        materials: all
            .filter((item) => !item.deleted && (!type || item.type === type))
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            ),
    };
}

export async function toggleBrowserMaterialFavorite(
    id: number,
): Promise<{ isFavorite: boolean }> {
    const material = await withStore<StoredMaterial | undefined>(
        MATERIALS,
        "readonly",
        (store) => store.get(id),
    );
    if (!material) throw new Error("Material not found");
    material.isFavorite = !material.isFavorite;
    material.updatedAt = new Date();
    await withStore<IDBValidKey>(MATERIALS, "readwrite", (store) =>
        store.put(material),
    );
    return { isFavorite: material.isFavorite };
}
