/**
 * Wire + domain types for the workspace agent.
 *
 * The agentic loop runs in the browser (canvas state lives only there); the
 * server route is a stateless per-turn streaming proxy. These types are the
 * contract between the two halves.
 */

import type { ModalityNodeType } from "@/constants/modality-nodes";

/* ------------------------------------------------------------------ */
/* Chat wire shape (OpenAI chat-completions compatible)                */
/* ------------------------------------------------------------------ */

export interface AgentToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export type AgentWireMessage =
    | { role: "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: AgentToolCall[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

export interface AgentChatRequest {
    messages: AgentWireMessage[];
    /** Plugin id selected in the panel's first-level picker. */
    pluginId: string;
    /** Model id from the plugin's advertised `SLOT_MODELS`. */
    model?: string;
    /** UI locale, so the agent answers in the user's language. */
    locale?: string;
}

/* ------------------------------------------------------------------ */
/* SSE events (server → client)                                        */
/* ------------------------------------------------------------------ */

export type AgentStreamEvent =
    | { type: "text_delta"; text: string }
    /** Emitted only once the tool call's argument fragments are complete. */
    | {
          type: "tool_call";
          id: string;
          name: string;
          arguments: Record<string, unknown>;
      }
    | { type: "done"; finishReason: string }
    | { type: "error"; message: string; code?: string };

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

export const AGENT_TOOL_NAMES = [
    "apply_graph_patch",
    "read_canvas",
    "validate_workflow",
    "describe_node_type",
    "search_docs",
    "list_workflows",
    "load_workflow",
    "save_workflow",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(name: string): name is AgentToolName {
    return (AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

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
