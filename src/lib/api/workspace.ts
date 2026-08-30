/**
 * Workspace API client — local workflows
 */

import type { ExecutableWorkflow } from "tongflow";
import type { Material } from "tongflow/canvas";
import { apiGet } from "tongflow/canvas";
import {
    deleteBrowserWorkflow,
    getBrowserWorkflow,
    listBrowserWorkflows,
    saveBrowserWorkflow,
} from "@/lib/browser-storage";

export interface Workflow {
    id: number;
    name: string;
    description?: string;
    flow: string;
    executable?: string;
    cover?: string | null;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
}

export interface SaveWorkflowRequest {
    workflowId?: number;
    name: string;
    description?: string;
    flow: Record<string, unknown>;
    executable?: ExecutableWorkflow;
}

export interface SaveWorkflowResponse {
    workflowId: number;
}

export interface ListWorkflowsResponse {
    workflows: Workflow[];
    pagination?: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
}

export interface GetWorkflowResponse {
    workflow: Workflow;
}

/**
 * Save workflow
 */
export async function saveWorkflow(
    data: SaveWorkflowRequest,
): Promise<SaveWorkflowResponse> {
    return { workflowId: await saveBrowserWorkflow(data) };
}

export async function listWorkflows(
    page = 1,
    limit = 10,
): Promise<ListWorkflowsResponse> {
    const all = await listBrowserWorkflows();
    const offset = (page - 1) * limit;
    return {
        workflows: all.slice(offset, offset + limit),
        pagination: {
            page,
            limit,
            total: all.length,
            hasMore: offset + limit < all.length,
        },
    };
}

export async function getWorkflow(id: number): Promise<GetWorkflowResponse> {
    const workflow = await getBrowserWorkflow(id);
    if (!workflow) throw new Error("Workflow not found");
    return { workflow };
}

export async function deleteWorkflow(id: number): Promise<void> {
    await deleteBrowserWorkflow(id);
}

export async function updateWorkflow(
    id: number,
    data: Partial<SaveWorkflowRequest>,
): Promise<void> {
    const current = await getBrowserWorkflow(id);
    if (!current) throw new Error("Workflow not found");
    const parsedFlow = JSON.parse(current.flow) as Record<string, unknown>;
    await saveBrowserWorkflow({
        workflowId: id,
        name: data.name ?? current.name,
        description: data.description ?? current.description,
        flow: data.flow ?? parsedFlow,
        executable: data.executable,
    });
}

export interface WorkflowMaterialsResponse {
    materials: Material[];
}

export async function getWorkflowMaterials(
    workflowId: number,
    type: string = "image",
): Promise<WorkflowMaterialsResponse> {
    return await apiGet<WorkflowMaterialsResponse>(
        `/api/workflow/${workflowId}/materials?type=${type}`,
    );
}
