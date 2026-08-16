/**
 * Compact canvas rendering for the agent.
 *
 * This text re-enters the prompt on every turn (as the auto-injected digest)
 * and on every `read_canvas` call, so compactness is a feature, not a polish
 * item. Node ids are shortened to 8 characters — `resolveNodeRef` accepts the
 * short form, the full uuid, or a patch-local alias.
 */

import type { Edge, Node } from "@xyflow/react";

/** Derived or mirrored keys the agent must never see or author. */
const HIDDEN_DATA_KEYS = new Set([
    "prompt", // built by buildPrompts() at run time
    "feature", // mirrored from the registry on mount
    "activeTab", // pure UI state
    "locked",
    "ids",
]);

/** Keys holding storage keys — rendered as a count, never verbatim. */
const FILE_KEYS = new Set(["fileKeys"]);

export const SHORT_ID_LENGTH = 8;

export function shortId(id: string): string {
    return id.slice(0, SHORT_ID_LENGTH);
}

/**
 * Resolve an agent-supplied node reference to a real node id.
 *
 * Accepts a patch-local alias, a full uuid, or a short (8-char) id. Returns
 * `{ ambiguous: true }` when a short id matches more than one node so the
 * caller can surface an actionable error instead of mutating the wrong node.
 */
export function resolveNodeRef(
    ref: string,
    nodes: Node[],
    aliases?: Map<string, string>,
): { id?: string; ambiguous?: boolean } {
    const aliased = aliases?.get(ref);
    if (aliased) return { id: aliased };

    if (nodes.some((n) => n.id === ref)) return { id: ref };

    const matches = nodes.filter((n) => n.id.startsWith(ref));
    if (matches.length === 1) return { id: matches[0].id };
    if (matches.length > 1) return { ambiguous: true };
    return {};
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

function fileSummary(value: unknown): string | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const exts = value
        .map((v) =>
            typeof v === "string" ? (v.split(".").pop() ?? "bin") : "bin",
        )
        .filter((e) => e.length <= 5);
    const ext = exts[0] ?? "bin";
    return `${value.length}×${ext}`;
}

function renderValue(value: unknown, maxText: number): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "string")
        return JSON.stringify(truncate(value, maxText));
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return undefined;
        if (value.every((v) => typeof v === "string")) {
            const head = (value as string[])
                .slice(0, 3)
                .map((v) => JSON.stringify(truncate(v, maxText)));
            const more = value.length > 3 ? `,+${value.length - 3}` : "";
            return `[${head.join(",")}${more}]`;
        }
        return `[${value.length} items]`;
    }
    return undefined;
}

function renderNodeLine(node: Node, maxText: number, status?: string): string {
    const parts: string[] = [`#${shortId(node.id)}`, node.type ?? "unknown"];
    const data = (node.data ?? {}) as Record<string, unknown>;

    for (const [key, value] of Object.entries(data)) {
        if (HIDDEN_DATA_KEYS.has(key)) continue;
        if (FILE_KEYS.has(key)) {
            const summary = fileSummary(value);
            if (summary) parts.push(`files=${summary}`);
            continue;
        }
        const rendered = renderValue(value, maxText);
        if (rendered !== undefined) parts.push(`${key}=${rendered}`);
    }

    if (status) parts.push(`[${status}]`);
    return parts.join(" ");
}

function renderEdgeLine(edge: Edge): string {
    const handles =
        edge.sourceHandle || edge.targetHandle
            ? ` ${edge.sourceHandle ?? "-"}→${edge.targetHandle ?? "-"}`
            : "";
    return `  ${shortId(edge.source)}${handles} → ${shortId(edge.target)}`;
}

export interface RenderCanvasOptions {
    /** Node ids the user currently has selected on the canvas. */
    selectedIds?: string[];
    /** nodeId → execution status, from the task store. */
    statusByNodeId?: ReadonlyMap<string, string>;
    /** Max characters per string value. Digest uses 60, full read 200. */
    maxText?: number;
    /** Restrict output to this subset (already scoped by the caller). */
    only?: Set<string>;
}

export function renderCanvas(
    nodes: Node[],
    edges: Edge[],
    options: RenderCanvasOptions = {},
): string {
    const { selectedIds, statusByNodeId, maxText = 60, only } = options;

    const visible = only ? nodes.filter((n) => only.has(n.id)) : nodes;
    if (visible.length === 0) return "canvas: empty";

    const visibleIds = new Set(visible.map((n) => n.id));
    const visibleEdges = edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );

    const lines: string[] = [
        `canvas: ${visible.length} node(s), ${visibleEdges.length} edge(s)${
            only ? ` (scoped from ${nodes.length})` : ""
        }`,
    ];

    for (const node of visible) {
        lines.push(renderNodeLine(node, maxText, statusByNodeId?.get(node.id)));
    }

    if (visibleEdges.length > 0) {
        lines.push("edges:");
        for (const edge of visibleEdges) lines.push(renderEdgeLine(edge));
    }

    const selectedVisible = (selectedIds ?? []).filter((id) =>
        visibleIds.has(id),
    );
    if (selectedVisible.length > 0) {
        lines.push(`user-selected: ${selectedVisible.map(shortId).join(", ")}`);
    }

    return lines.join("\n");
}

/**
 * Node ids within `hops` edges of `rootId`, walking both directions. Used by
 * `read_canvas({ scope: "around:<id>" })` so editing one chain of a large
 * canvas costs only that chain's tokens.
 */
export function neighborhood(
    rootId: string,
    edges: Edge[],
    hops = 2,
): Set<string> {
    const seen = new Set<string>([rootId]);
    let frontier = [rootId];

    for (let i = 0; i < hops; i++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const edge of edges) {
                if (edge.source === id && !seen.has(edge.target)) {
                    seen.add(edge.target);
                    next.push(edge.target);
                }
                if (edge.target === id && !seen.has(edge.source)) {
                    seen.add(edge.source);
                    next.push(edge.source);
                }
            }
        }
        if (next.length === 0) break;
        frontier = next;
    }

    return seen;
}
