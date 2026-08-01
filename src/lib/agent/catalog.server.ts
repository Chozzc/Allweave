import "server-only";

/**
 * Derived node catalog for the agent's system prompt.
 *
 * Generated from the same registries the canvas itself runs on
 * (NODE_TYPE_TO_ABI_FEATURE + ABI topology + sourceSpec overrides + the live
 * plugins registry), so unlike the hand-maintained READMEs it cannot drift.
 * One compact line per node type; the full per-field schema stays behind the
 * `describe_node_type` tool.
 */

import type { JSONSchema7 } from "json-schema";
import enMessages from "@/i18n/messages/en.json";
import { getAbiTopology } from "@/lib/abi/handle-introspect";
import {
    NODE_TYPE_SOURCE_SPEC,
    NODE_TYPE_TO_ABI_FEATURE,
} from "@/lib/abi/node-feature-registry";
import { type ResolvedField, resolveSpec } from "@/lib/abi/resolve";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** Node types whose i18n title key is not simply `type` minus "Node". */
const TITLE_KEY_EXCEPTIONS: Record<string, string> = {
    genTextNode: "textGenText",
    textsGenTextNode: "combineText",
    videoGenTextSpeechRecognizeNode: "speechRecognize",
    audioGenTextSpeechRecognizeNode: "speechRecognize",
    imageGenImageUpscaleNode: "imageUpscale",
    removeVideoSubtitleNode: "removeSubtitle",
    denoiseAudioSubtitleNode: "denoiseAudio",
    separateAudioTrackNode: "separateTrack",
    extractAudioNode: "extractAudioTrack",
    videoImageGenVideoMixNode: "videoImageMix",
    videoImageGenVideoMoveNode: "videoImageMove",
    concatVideoComposeNode: "concatVideo",
};

const NODE_TITLES: Record<string, string> = enMessages.Workspace.nodes
    .titles as Record<string, string>;

function labelForNodeType(nodeType: string): string {
    const key = TITLE_KEY_EXCEPTIONS[nodeType] ?? nodeType.replace(/Node$/, "");
    const title = NODE_TITLES?.[key];
    if (title) return title;
    // Fall back to a spaced form of the type name.
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Field rendering                                                     */
/* ------------------------------------------------------------------ */

function schemaSummary(schema: JSONSchema7 | undefined): string {
    if (!schema) return "any";
    if (Array.isArray(schema.enum)) {
        return schema.enum.map((v) => JSON.stringify(v)).join("|");
    }
    if (schema.type === "array") return "array";
    return typeof schema.type === "string" ? schema.type : "any";
}

function renderField(
    name: string,
    field: ResolvedField,
    configSchema: JSONSchema7 | undefined,
): string | undefined {
    const req = field.required ? "*" : "";
    switch (field.kind) {
        case "handle": {
            const mode = field.batch
                ? ",batch"
                : field.collect
                  ? ",collect-many"
                  : "";
            const manual = field.manual ? ",or-config" : "";
            return `${name}${req}=wire(${field.nodeType}${mode}${manual})`;
        }
        case "config":
            return `${name}${req}:${schemaSummary(configSchema)}`;
        case "static":
        case "input":
            // Pinned or workflow-input fields are not the agent's to set.
            return undefined;
    }
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

function renderExecutableLine(
    nodeType: string,
    pluginsBySlot: Record<string, string[]>,
    modelsFor: (pluginId: string, slot: string) => string[],
): string | undefined {
    const feature = NODE_TYPE_TO_ABI_FEATURE[nodeType];
    const plugins = pluginsBySlot[feature] ?? [];
    // Nodes with no installed plugin are listed separately so the agent can
    // warn instead of silently building a dead graph.
    const spec = resolveSpec(feature, NODE_TYPE_SOURCE_SPEC[nodeType]);
    const topology = getAbiTopology(feature);

    // Config schemas live on the raw topology classification.
    const inputProps: Record<string, JSONSchema7> = {};
    for (const [f, cls] of Object.entries(topology.inputs)) {
        if (cls.kind === "config") inputProps[f] = cls.schema;
    }

    const fields = topology.inputOrder
        .map((f) => renderField(f, spec.fields[f], inputProps[f]))
        .filter(Boolean);

    const outputs = topology.outputs
        .map(
            (o) => `${o.field}→${o.nodeType}${o.expandEach ? "(fan-out)" : ""}`,
        )
        .join(", ");

    const pluginParts = plugins.map((p) => {
        const models = modelsFor(p, feature);
        return models.length > 0
            ? `${p}[${models.slice(0, 8).join(",")}${models.length > 8 ? ",…" : ""}]`
            : p;
    });

    const pluginInfo =
        pluginParts.length > 0
            ? ` plugins: ${pluginParts.join("; ")}`
            : " plugins: NONE-INSTALLED";

    return `${nodeType} "${labelForNodeType(nodeType)}" — in: ${
        fields.join(", ") || "(none)"
    }. out: ${outputs || "(none)"}.${pluginInfo}`;
}

const MODALITY_SECTION = `## Data (modality) nodes — carry assets, never execute
The graph strictly alternates: add node → data node → executable → data node → executable → … → data node. Executables never wire directly to executables — every executable output gets an empty downstream data node of the output's modality, created at build time and filled at run time.
textNode — data:{texts:[string,…]}. Multiple texts on one node = one batch (fans out downstream).
imageNode / videoNode / audioNode / modelNode / fileNode — data:{fileKeys:[…]}. Never write fileKeys yourself; reference chat uploads via fromAttachment. Result data nodes are created with empty data.
linkNode — data:{texts:[url,…]}.
Add nodes (addTextNode {manualValue}, addImageNode, addVideoNode, addAudioNode, addFileNode, addModelNode, addLinkNode) — user-facing input widgets that start every chain, feeding their data node (use fromAttachment for uploads). The add-node pair is what makes an input replaceable in App Mode.`;

let cachedCatalog: { generatedAt: string; text: string } | null = null;

export function buildAgentCatalog(): string {
    const registry = loadPluginsRegistry();
    if (cachedCatalog && cachedCatalog.generatedAt === registry.generatedAt) {
        return cachedCatalog.text;
    }

    const modelsFor = (pluginId: string, slot: string): string[] =>
        registry.plugins[pluginId]?.methodsByNodeSlot?.[slot]?.models ?? [];

    const available: string[] = [];
    const uninstalled: string[] = [];

    for (const nodeType of Object.keys(NODE_TYPE_TO_ABI_FEATURE)) {
        const line = renderExecutableLine(
            nodeType,
            registry.nodePluginMap,
            modelsFor,
        );
        if (!line) continue;
        if (line.endsWith("NONE-INSTALLED")) uninstalled.push(line);
        else available.push(line);
    }

    const sections = [
        MODALITY_SECTION,
        `## Executable nodes (${available.length} with installed plugins)
Legend: field*=required. wire(x) = fed by an edge from an upstream node of type x; "batch" fans out one task per element; "collect-many" merges several edges into one array; "or-config" = wire optional, config value used as fallback. Other fields are config — set them via data in the patch. First listed plugin is the default.
${available.join("\n")}`,
    ];

    if (uninstalled.length > 0) {
        sections.push(
            `## Nodes with NO installed plugin — these will not run; warn the user and suggest alternatives instead of using them
${uninstalled.map((l) => l.replace(" plugins: NONE-INSTALLED", "")).join("\n")}`,
        );
    }

    const text = sections.join("\n\n");
    cachedCatalog = { generatedAt: registry.generatedAt, text };
    return text;
}
