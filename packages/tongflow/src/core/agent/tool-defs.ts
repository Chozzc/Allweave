/**
 * Provider-neutral tool definitions for agent-driven graph editing.
 *
 * Each entry is `{ name, description, parameters }` where `parameters` is a
 * JSON Schema — wrap them in whatever envelope your LLM provider expects
 * (OpenAI `{type:"function", function}`, Anthropic `input_schema`, …) and
 * dispatch on `name` to the matching function in this module's siblings
 * (`applyGraphPatch`, `readCanvas`, `validateWorkflow`, `describeNodeType`).
 * Descriptions are prescriptive about *when* to use each tool — that is what
 * keeps a model from inventing uuids or rebuilding graphs it should patch.
 *
 * Persistence tools (list / load / save a workflow) are host concerns and are
 * intentionally not defined here.
 */

export interface AgentToolDefinition {
    name: string;
    description: string;
    /** JSON Schema for the tool arguments. */
    parameters: Record<string, unknown>;
}

export const TONGFLOW_TOOL_NAMES = [
    "apply_graph_patch",
    "read_canvas",
    "validate_workflow",
    "describe_node_type",
] as const;

export type TongflowToolName = (typeof TONGFLOW_TOOL_NAMES)[number];

const NODE_REF =
    "A node reference: an alias declared in this patch's add_nodes, or an existing node's short id (8 chars, as shown in the canvas listing).";

export const TONGFLOW_TOOL_DEFS: readonly AgentToolDefinition[] = [
    {
        name: "apply_graph_patch",
        description:
            "The ONLY way to change the canvas. Describes one coherent change: nodes to create, edges to draw, params to set, nodes to delete. " +
            "Always patch incrementally — never rebuild an existing workflow from scratch, and never touch nodes the user did not ask about. " +
            "Reference brand-new nodes by the alias you give them; reference existing nodes by their short id from the canvas listing. Never invent uuids.",
        parameters: {
            type: "object",
            properties: {
                add_nodes: {
                    type: "array",
                    description:
                        "Nodes to create. Layout is automatic — never supply coordinates.",
                    items: {
                        type: "object",
                        properties: {
                            alias: {
                                type: "string",
                                description:
                                    "Short local name (e.g. 't1', 'gen1') used to reference this node in add_edges within this same patch.",
                            },
                            type: {
                                type: "string",
                                description:
                                    "Canvas node type from the node catalog (e.g. 'textNode', 'textGenImageNode').",
                            },
                            data: {
                                type: "object",
                                description:
                                    "Initial data. For textNode use {texts:[...]}. For an executable node set its config fields (e.g. {text:'...', duration:5}). Never set 'prompt' — it is derived at run time.",
                                additionalProperties: true,
                            },
                            pluginId: {
                                type: "string",
                                description:
                                    "Optional explicit plugin for an executable node. Omit to use the installed default.",
                            },
                            pluginModel: {
                                type: "string",
                                description:
                                    "Optional model id, only for plugins that advertise models.",
                            },
                            fromAttachment: {
                                type: "integer",
                                description:
                                    "1-based index of a file the user attached to the chat. Use this for add*Node/modality nodes carrying user uploads — never write a storage key yourself.",
                            },
                        },
                        required: ["alias", "type"],
                    },
                },
                add_edges: {
                    type: "array",
                    description:
                        "Edges to draw. Handles are derived automatically; supply them only to disambiguate (e.g. several images into 'in:images').",
                    items: {
                        type: "object",
                        properties: {
                            from: { type: "string", description: NODE_REF },
                            to: { type: "string", description: NODE_REF },
                            fromHandle: {
                                type: "string",
                                description:
                                    "Optional source handle, e.g. 'out:image'.",
                            },
                            toHandle: {
                                type: "string",
                                description:
                                    "Optional target handle, e.g. 'in:images'.",
                            },
                        },
                        required: ["from", "to"],
                    },
                },
                update_nodes: {
                    type: "array",
                    description:
                        "Change params on existing nodes. Merged into current data — send only the keys you are changing.",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: NODE_REF },
                            data: {
                                type: "object",
                                additionalProperties: true,
                            },
                        },
                        required: ["id", "data"],
                    },
                },
                remove_nodes: {
                    type: "array",
                    description:
                        "Node references to delete. Explain the impact in your reply before deleting anything the user did not explicitly ask you to remove.",
                    items: { type: "string" },
                },
            },
        },
    },
    {
        name: "read_canvas",
        description:
            "Read the canvas in full detail. A summary is already attached to the latest user message, so call this only when you need untruncated values or a specific neighbourhood of a large canvas.",
        parameters: {
            type: "object",
            properties: {
                scope: {
                    type: "string",
                    description:
                        "'all' (default), 'selection' for what the user has selected, or 'around:<shortId>' for a node and its neighbours.",
                },
            },
        },
    },
    {
        name: "validate_workflow",
        description:
            "Health-check the canvas: cycles, required inputs left unconnected, required config left empty, missing or uninstalled plugins. Use it when the user asks why their workflow will not run, and before telling them a build is finished.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "describe_node_type",
        description:
            "Full config schema for one node type (enums, ranges, defaults) — more detail than the catalog line. Use before setting an unfamiliar param.",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    description: "Canvas node type, e.g. 'imageGenVideoNode'.",
                },
            },
            required: ["type"],
        },
    },
];
