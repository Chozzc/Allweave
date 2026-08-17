/**
 * Domain types for programmatic (agent-driven) graph editing: tool results
 * and the graph patch — the only write form an external agent gets.
 */

import type { ModalityNodeType } from "@/constants/modality-nodes";

/* ------------------------------------------------------------------ */
/* Tool results                                                        */
/* ------------------------------------------------------------------ */

export type ToolOk = { ok: true } & Record<string, unknown>;
export interface ToolErr {
    ok: false;
    error: string;
    /** Actionable correction for the model — always prefer this over prose. */
    hint?: string;
}
export type ToolResult = ToolOk | ToolErr;

/* ------------------------------------------------------------------ */
/* Graph patch — the agent's only write form                           */
/* ------------------------------------------------------------------ */

/**
 * A node to create. `alias` is a short local name (e.g. "t1") the agent uses
 * to refer to this node elsewhere in the same patch; the executor assigns the
 * real uuid. The agent never invents uuids.
 */
export interface GraphPatchAddNode {
    alias: string;
    type: string;
    data?: Record<string, unknown>;
    /** Optional explicit plugin choice; omitted → resolved on mount. */
    pluginId?: string;
    pluginModel?: string;
    /**
     * 1-based index into the pending chat attachments. The executor substitutes
     * the real storage key so the model never transcribes a fileKey.
     */
    fromAttachment?: number;
}

/** `from`/`to` accept an alias from this patch, a full uuid, or a short id. */
export interface GraphPatchAddEdge {
    from: string;
    to: string;
    fromHandle?: string;
    toHandle?: string;
}

export interface GraphPatchUpdateNode {
    id: string;
    /** Merged into the node's existing `data` — never replaces it wholesale. */
    data: Record<string, unknown>;
}

export interface GraphPatch {
    add_nodes?: GraphPatchAddNode[];
    add_edges?: GraphPatchAddEdge[];
    update_nodes?: GraphPatchUpdateNode[];
    remove_nodes?: string[];
}

/** Per-operation outcome so a partial failure can be patched up next turn. */
export interface PatchStepResult {
    op: "add_node" | "add_edge" | "update_node" | "remove_node";
    ref: string;
    ok: boolean;
    nodeId?: string;
    /** True when `expands` reused an existing same-type child. */
    reused?: boolean;
    error?: string;
    hint?: string;
}

/* ------------------------------------------------------------------ */
/* Chat attachments                                                    */
/* ------------------------------------------------------------------ */

export interface AgentAttachment {
    /** 1-based; this is what the model cites via `fromAttachment`. */
    index: number;
    fileKey: string;
    url: string;
    name: string;
    mime: string;
    modality: ModalityNodeType;
    /** Canvas node type that carries this asset (e.g. "addImageNode"). */
    addNodeType: string;
    size?: number;
}
