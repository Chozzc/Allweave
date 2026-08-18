/**
 * Workflow tools: create / patch / read / validate / bind / run.
 *
 * The graph-editing tools wrap tongflow's own agent tools
 * (apply_graph_patch, read_canvas, validate_workflow, describe_node_type),
 * adding the `workflow` file argument — the file on disk is the canvas.
 */
import type { JsonValue } from "@deepseek-ai/dsh-session";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { Pass, WorkflowFileMeta } from "../shared/types.ts";
import {
    compact,
    OWNER_DESC,
    PASS_DESC,
    PROJECT_PARAM,
    resolveProjectId,
    type ToolEnv,
    text,
} from "./support.ts";

const WORKFLOW_PARAM = {
    type: "string",
    required: true,
    description:
        "Workflow file, e.g. 'character-sheet' or 'workflows/character-sheet.tongflow.json' (project-relative).",
} as const;

const NODE_REF =
    "A node reference: an alias declared in this patch's add_nodes, or an existing node's short id (8 chars, as shown by tongflow_workflow_read).";

const TARGET_PARAM = {
    type: "object",
    additionalProperties: false,
    properties: {
        owner: { type: "string", required: true, description: OWNER_DESC },
        pass: { type: "string", required: true, description: PASS_DESC },
    },
    description:
        "Where the outputs land as takes: { owner, pass }. Omit to use the workflow's meta.target.",
} as const;

export function workflowTools(env: ToolEnv): ToolDefinition[] {
    const { api } = env;
    return [
        defineTool({
            name: "tongflow_workflow_new",
            description:
                "Create a new workflow file — ONE PER GENERATED ASSET, named after its target (CHR_MEI_REF, EP01_SC001_SH0010_KF, EP01_CUT; add a suffix for variants). Copy a starting shape with fromTemplate ('character-sheet', 'shot-keyframe', 'dub-line', 'shot-i2v', … resolved under workflows/templates/), then patch the concrete prompt / tf:// refs into its nodes so the file is self-contained and re-runnable. " +
                "Media generation ALWAYS goes through such a file: create → patch nodes → run. Never overwrite an existing file; patch it instead. A <OWNER>_<PASS> name implies the target.",
            parameters: {
                project: PROJECT_PARAM,
                path: {
                    type: "string",
                    required: true,
                    description:
                        "New file name = target, e.g. 'EP01_SC001_SH0010_KF' → workflows/EP01_SC001_SH0010_KF.tongflow.json.",
                },
                fromTemplate: {
                    type: "string",
                    description:
                        "Template to copy: a name under workflows/templates/ (e.g. 'shot-keyframe') or any workflow key.",
                },
                name: { type: "string", description: "Display name." },
                description: {
                    type: "string",
                    description: "What this workflow is for.",
                },
                target: TARGET_PARAM,
                purpose: {
                    type: "string",
                    description: "Free-form purpose recorded in meta.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const meta: WorkflowFileMeta = {};
                if (args.target)
                    meta.target = {
                        owner: args.target.owner,
                        pass: args.target.pass as Pass,
                    };
                if (args.purpose) meta.purpose = args.purpose;
                return compact(
                    await api.newWorkflow(pid, args.path, {
                        ...(args.fromTemplate
                            ? { fromTemplate: args.fromTemplate }
                            : {}),
                        ...(args.name ? { name: args.name } : {}),
                        ...(args.description
                            ? { description: args.description }
                            : {}),
                        meta,
                    }),
                );
            },
        }),
        defineTool({
            name: "tongflow_workflow_patch",
            description:
                "The ONLY way to change a workflow's graph. Describes one coherent change: nodes to create, edges to draw, params to set, nodes to delete. " +
                "Patch incrementally — never rebuild an existing workflow from scratch. Reference new nodes by the alias you give them; existing nodes by their short id. Never invent uuids. " +
                "Graph grammar: data node (textNode / imageNode / audioNode / videoNode …) → executable node → its output data nodes are created automatically. " +
                "For a data node use data:{texts:[…]} or data:{fileKeys:['tf://CHR_MEI/REF']} (tf:// refs are resolved at run time). " +
                "Compose prompts with {{tf://…}} placeholders inside ONE text, e.g. texts:['{{tf://STY_MAIN/prompt}}, {{tf://CHR_MEI/prompt}}, full-body reference sheet'] — never chain text-combining nodes for that. " +
                "A level-0 data node WITHOUT static data becomes a workflow INPUT you bind later with tongflow_workflow_bind — give it a readable name with data:{inputName:'prompt'} (else it is input_<id>). " +
                "Use tongflow_node_catalog / tongflow_node_describe to see node types, their wires and config fields.",
            parameters: {
                project: PROJECT_PARAM,
                workflow: WORKFLOW_PARAM,
                add_nodes: {
                    type: "array",
                    description:
                        "Nodes to create. Layout is automatic — never supply coordinates.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            alias: {
                                type: "string",
                                required: true,
                                description:
                                    "Short local name (e.g. 't1', 'gen1') used in add_edges within this patch.",
                            },
                            type: {
                                type: "string",
                                required: true,
                                description:
                                    "Canvas node type from the catalog (e.g. 'textNode', 'textGenImageNode', 'imageGenVideoNode').",
                            },
                            data: {
                                type: "object",
                                additionalProperties: true,
                                description:
                                    "Initial data. textNode: {texts:[…]}; imageNode etc.: {fileKeys:[…]} (may be tf:// refs); executable node: its config fields (e.g. {aspect_ratio:'16:9', duration:5}). Never set 'prompt'.",
                            },
                            pluginId: {
                                type: "string",
                                description:
                                    "Explicit plugin for an executable node (see catalog). Omit to use the installed default.",
                            },
                            pluginModel: {
                                type: "string",
                                description:
                                    "Model id, only for plugins that advertise models.",
                            },
                        },
                    },
                },
                add_edges: {
                    type: "array",
                    description:
                        "Edges to draw. Handles are derived automatically; supply them only to disambiguate (e.g. several images into 'in:images').",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            from: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
                            to: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
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
                    },
                },
                update_nodes: {
                    type: "array",
                    description:
                        "Change params on existing nodes. Merged into current data — send only the keys you are changing.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
                            data: {
                                type: "object",
                                additionalProperties: true,
                                required: true,
                            },
                        },
                    },
                },
                remove_nodes: {
                    type: "array",
                    description: "Node references to delete.",
                    items: { type: "string" },
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const patch: Record<string, unknown> = {};
                if (args.add_nodes) patch.add_nodes = args.add_nodes;
                if (args.add_edges) patch.add_edges = args.add_edges;
                if (args.update_nodes) patch.update_nodes = args.update_nodes;
                if (args.remove_nodes) patch.remove_nodes = args.remove_nodes;
                return compact(
                    await api.graphTool(
                        pid,
                        args.workflow,
                        "apply_graph_patch",
                        patch,
                    ),
                );
            },
        }),
        defineTool({
            name: "tongflow_workflow_read",
            description:
                "Read a workflow file in full: rendered graph (nodes with short ids, params, edges), inputs (with current tf:// bindings), outputs, meta.target and a validation report. " +
                "Read before patching a workflow you did not just create, and after the user edited it on the canvas.",
            parameters: { project: PROJECT_PARAM, workflow: WORKFLOW_PARAM },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(await api.describeWorkflow(pid, args.workflow));
            },
        }),
        defineTool({
            name: "tongflow_workflow_list",
            description:
                "List the project's workflow files with their inputs, bindings and targets.",
            parameters: { project: PROJECT_PARAM },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(await api.listWorkflows(pid));
            },
        }),
        defineTool({
            name: "tongflow_workflow_validate",
            description:
                "Health-check a workflow: cycles, unconnected required inputs, empty required config, missing / uninstalled plugins. Run it before executing.",
            parameters: { project: PROJECT_PARAM, workflow: WORKFLOW_PARAM },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(
                    await api.graphTool(
                        pid,
                        args.workflow,
                        "validate_workflow",
                        {},
                    ),
                );
            },
        }),
        defineTool({
            name: "tongflow_workflow_bind",
            description:
                "Set a workflow's default input bindings and target without touching the graph. Bindings map input names to tf:// refs (tf://CHR_MEI/REF, tf://EP01_SC001_SH0010/dialogue/1, tf://EP01/ANI), project keys, URLs, or literal text for text inputs. " +
                "The consistency kit is what makes shots match: bind character REF images and prepend tf://STY_MAIN/prompt + tf://CHR_X/prompt to prompts.",
            parameters: {
                project: PROJECT_PARAM,
                workflow: WORKFLOW_PARAM,
                bindings: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "input name → tf:// ref | project key | text | array of those.",
                },
                unbind: {
                    type: "array",
                    items: { type: "string" },
                    description: "Input names to remove bindings for.",
                },
                target: TARGET_PARAM,
                purpose: { type: "string" },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const patch: Partial<WorkflowFileMeta> & { unbind?: string[] } =
                    {};
                if (args.bindings)
                    patch.bindings = args.bindings as Record<
                        string,
                        string | string[]
                    >;
                if (args.unbind) patch.unbind = args.unbind;
                if (args.target)
                    patch.target = {
                        owner: args.target.owner,
                        pass: args.target.pass as Pass,
                    };
                if (args.purpose !== undefined) patch.purpose = args.purpose;
                return compact(
                    await api.bindWorkflow(pid, args.workflow, patch),
                );
            },
        }),
        defineTool({
            name: "tongflow_node_catalog",
            description:
                "One line per canvas node type: ABI slot, wires (inputs from other nodes; * = required), config fields, outputs, and which installed plugins implement it. Consult before patching.",
            parameters: {},
            output: { schema: { type: "string" }, render: (_a, v) => text(v) },
            async execute() {
                return api.nodeCatalog();
            },
        }),
        defineTool({
            name: "tongflow_node_describe",
            description:
                "Full config schema for one node type (enums, ranges, defaults) — more detail than the catalog line. Use before setting an unfamiliar param.",
            parameters: {
                type: {
                    type: "string",
                    required: true,
                    description: "Canvas node type, e.g. 'imageGenVideoNode'.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                // describe_node_type does not need a file; reuse any project (or none).
                const { describeNodeType } = await import("tongflow");
                void exec;
                return compact(describeNodeType(args.type));
            },
        }),
    ];
}

export type { JsonValue };
