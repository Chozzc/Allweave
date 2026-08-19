/**
 * Compose the per-asset workflows of a shot / episode / entity into one big
 * workflow for human review and one-shot re-runs.
 *
 * Every asset workflow references upstream products by role (`tf://<SHOT>/KF`
 * inside an imageNode). Composition copies all part graphs onto one canvas and,
 * wherever a data node references a product that another part *produces*,
 * replaces the static reference by a real edge from that part's terminal
 * executable node. A terminal "tap" data node keeps every stage's product an
 * output, and `meta.targets` maps each output back to its owner/pass so a run
 * of the composed graph still lands takes in SB/KF/DLG/ANI …
 */
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    type ExecutableWorkflow,
    isAbiNodeType,
    type PluginsRegistry,
    resolvedSpecForNodeType,
    resolveEdgeHandles,
} from "tongflow";
import type { Pass, WorkflowFileMeta } from "../shared/types.ts";
import { exists } from "../util/fsx.ts";
import { readBreakdown } from "./breakdown.ts";
import {
    ENTITY_PASSES,
    EPISODE_PASSES,
    isEpisodeId,
    isSceneId,
    isShotId,
    ownerKindOf,
    SHOT_PASSES,
    shotSortKey,
} from "./naming.ts";
import { DIRS, ownerDir, toProjectKey, WORKFLOW_EXT } from "./paths.ts";
import { isTfRef, TF_SCHEME } from "./refs.ts";
import {
    hydrateStore,
    parseAssetWorkflowName,
    readWorkflowFile,
    saveWorkflowFile,
    type WorkflowDocument,
} from "./workflow-file.ts";

type Node = ExecutableWorkflow["originalFlow"]["nodes"][number];
type Edge = ExecutableWorkflow["originalFlow"]["edges"][number];

export interface ComposePart {
    key: string;
    owner: string;
    pass: Pass;
    doc: WorkflowDocument;
}

export interface ComposeResult {
    key: string;
    parts: { key: string; owner: string; pass: Pass }[];
    links: number;
    /** Product references left as tf:// (no producer in this composition). */
    unlinked: string[];
    nodeCount: number;
}

const DATA_TYPES: Record<string, string> = {
    image: "imageNode",
    video: "videoNode",
    audio: "audioNode",
    text: "textNode",
    model: "modelNode",
    file: "fileNode",
};
const OUTPUT_TYPE_BY_NODE: Record<string, string> = {
    imageNode: "image",
    videoNode: "video",
    audioNode: "audio",
    textNode: "text",
    modelNode: "model",
    fileNode: "file",
};

async function partFiles(
    projectRoot: string,
    owner: string,
    pass: Pass,
): Promise<string[]> {
    const out: string[] = [];
    const dir = join(ownerDir(projectRoot, owner), pass);
    if (await exists(dir)) {
        for (const n of (await readdir(dir))
            .filter((x) => x.endsWith(WORKFLOW_EXT))
            .sort()) {
            out.push(toProjectKey(projectRoot, join(dir, n)));
        }
    }
    // Older projects kept asset workflows under workflows/<OWNER>_<PASS>[_suffix].tongflow.json.
    const legacy = join(projectRoot, DIRS.workflows);
    if (await exists(legacy)) {
        for (const n of (await readdir(legacy))
            .filter((x) => x.endsWith(WORKFLOW_EXT))
            .sort()) {
            const parsed = parseAssetWorkflowName(basename(n, WORKFLOW_EXT));
            if (parsed && parsed.owner === owner && parsed.pass === pass)
                out.push(toProjectKey(projectRoot, join(legacy, n)));
        }
    }
    return out;
}

/** The parts of an owner in production order (shot: SB→KF→DLG→ANI; episode: every shot then MUS/SFX/MIX/CUT). */
export async function collectParts(
    projectRoot: string,
    owner: string,
): Promise<ComposePart[]> {
    const kind = ownerKindOf(owner);
    const owners: { owner: string; passes: readonly Pass[] }[] = [];
    if (kind === "entity") owners.push({ owner, passes: ENTITY_PASSES });
    else if (kind === "shot") owners.push({ owner, passes: SHOT_PASSES });
    else {
        const bd = await readBreakdown(projectRoot, owner);
        const shots = (bd?.scenes ?? [])
            .flatMap((s) => s.shots.map((h) => h.id))
            .sort((a, b) => shotSortKey(a) - shotSortKey(b));
        for (const shot of shots)
            owners.push({ owner: shot, passes: SHOT_PASSES });
        owners.push({ owner, passes: EPISODE_PASSES });
    }
    const parts: ComposePart[] = [];
    for (const o of owners) {
        for (const pass of o.passes) {
            for (const key of await partFiles(projectRoot, o.owner, pass)) {
                const doc = await readWorkflowFile(projectRoot, key);
                if (doc.flow.nodes.length === 0) continue;
                parts.push({ key, owner: o.owner, pass, doc });
            }
        }
    }
    return parts;
}

interface RefTarget {
    owner: string;
    pass: Pass;
    /** `tf://EP01/ANI`-style: every shot of the sequence. */
    collection: boolean;
}

/** Parse `tf://<owner>/<PASS>` (no take, no *) into a linkable product ref. */
function productRef(value: unknown): RefTarget | undefined {
    if (!isTfRef(value)) return undefined;
    const segs = value.slice(TF_SCHEME.length).split("/").filter(Boolean);
    if (segs.length !== 2) return undefined;
    const [owner, pass] = segs;
    const isPassCode =
        (SHOT_PASSES as readonly string[]).includes(pass) ||
        (ENTITY_PASSES as readonly string[]).includes(pass) ||
        (EPISODE_PASSES as readonly string[]).includes(pass);
    if (!isPassCode) return undefined;
    if (
        isShotId(owner) ||
        (isEpisodeId(owner) &&
            (EPISODE_PASSES as readonly string[]).includes(pass))
    )
        return { owner, pass: pass as Pass, collection: false };
    if (
        (isEpisodeId(owner) || isSceneId(owner)) &&
        (SHOT_PASSES as readonly string[]).includes(pass)
    )
        return { owner, pass: pass as Pass, collection: true };
    if (!isShotId(owner) && !isEpisodeId(owner) && !isSceneId(owner))
        return { owner, pass: pass as Pass, collection: false }; // entity
    return undefined;
}

/** Terminal executable nodes of a part whose ABI outputs include the wanted data node type. */
function producersFor(
    part: { nodes: Node[]; edges: Edge[] },
    dataNodeType: string,
): Node[] {
    const hasOut = new Set(part.edges.map((e) => e.source));
    return part.nodes.filter((n) => {
        const type = n.type ?? "";
        if (!isAbiNodeType(type) || hasOut.has(n.id)) return false;
        const spec = resolvedSpecForNodeType(type);
        return Boolean(
            spec?.topology.outputs.some((o) => o.nodeType === dataNodeType),
        );
    });
}

export async function composeWorkflow(
    projectRoot: string,
    owner: string,
    registry?: PluginsRegistry,
): Promise<ComposeResult> {
    const parts = await collectParts(projectRoot, owner);
    if (parts.length === 0)
        throw new Error(`${owner} has no asset workflows to compose yet`);

    // 1. Copy every part with fresh ids, laid out left→right by part.
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const partNodes: {
        part: ComposePart;
        nodes: Node[];
        edges: Edge[];
        endNodes: Node[];
    }[] = [];
    let xOffset = 0;
    for (const part of parts) {
        const idMap = new Map<string, string>();
        const pnodes: Node[] = [];
        let width = 0;
        for (const n of part.doc.flow.nodes) {
            const id = randomUUID();
            idMap.set(n.id, id);
            const x = (n.position?.x ?? 0) + xOffset;
            width = Math.max(width, (n.position?.x ?? 0) + 520);
            pnodes.push({
                ...structuredClone(n),
                id,
                position: { x, y: n.position?.y ?? 0 },
                selected: false,
            } as Node);
        }
        const pedges: Edge[] = part.doc.flow.edges
            .filter((e) => idMap.has(e.source) && idMap.has(e.target))
            .map(
                (e) =>
                    ({
                        ...structuredClone(e),
                        id: randomUUID(),
                        source: idMap.get(e.source)!,
                        target: idMap.get(e.target)!,
                    }) as Edge,
            );
        xOffset += width + 200;
        nodes.push(...pnodes);
        edges.push(...pedges);
        const hasOut = new Set(pedges.map((e) => e.source));
        partNodes.push({
            part,
            nodes: pnodes,
            edges: pedges,
            endNodes: pnodes.filter(
                (n) => isAbiNodeType(n.type ?? "") && !hasOut.has(n.id),
            ),
        });
    }

    // 2. Link product references to producers.
    let links = 0;
    const unlinked: string[] = [];
    const targets: Record<string, { owner: string; pass: Pass }> = {};
    const tapped = new Set<string>(); // producer exec ids that already have a tap
    const producerParts = (ref: RefTarget) =>
        partNodes.filter(
            (pn) =>
                (ref.collection
                    ? isShotId(pn.part.owner) &&
                      (ref.owner.length === 4
                          ? true
                          : pn.part.owner.startsWith(`${ref.owner}_`))
                    : pn.part.owner === ref.owner) && pn.part.pass === ref.pass,
        );

    for (let bi = 0; bi < partNodes.length; bi++) {
        const B = partNodes[bi];
        for (const dn of B.nodes) {
            const type = dn.type ?? "";
            if (isAbiNodeType(type) || !type.endsWith("Node")) continue;
            const data = (dn.data ?? {}) as {
                fileKeys?: unknown;
                texts?: unknown;
            };
            const keys = Array.isArray(data.fileKeys)
                ? (data.fileKeys as unknown[])
                : [];
            const refs = keys
                .map((k) => ({ raw: k, ref: productRef(k) }))
                .filter((x) => x.ref);
            if (refs.length === 0) continue;
            const consumers = edges.filter((e) => e.source === dn.id);
            const remaining: unknown[] = keys.filter((k) => !productRef(k));
            let linkedAny = false;
            for (const { raw, ref } of refs) {
                const producers = producerParts(ref!).filter(
                    (pn) => partNodes.indexOf(pn) < bi,
                );
                const execs = producers.flatMap((pn) =>
                    producersFor(
                        { nodes: pn.nodes, edges: pn.edges },
                        type,
                    ).map((n) => ({ n, pn })),
                );
                if (execs.length === 0) {
                    remaining.push(raw);
                    unlinked.push(String(raw));
                    continue;
                }
                linkedAny = true;
                if (ref!.collection) {
                    // Every producer → its own channel data node → the consumers of
                    // this data node (executables never connect directly).
                    for (const { n, pn } of execs) {
                        const channel: Node = {
                            id: randomUUID(),
                            type,
                            position: {
                                x: (n.position?.x ?? 0) + 560,
                                y: n.position?.y ?? 0,
                            },
                            data: { label: `${pn.part.owner}/${pn.part.pass}` },
                        } as Node;
                        nodes.push(channel);
                        const h = resolveEdgeHandles({
                            sourceType: n.type,
                            targetType: type,
                        });
                        edges.push({
                            id: randomUUID(),
                            source: n.id,
                            target: channel.id,
                            type: "custom-edge",
                            ...(h.sourceHandle
                                ? { sourceHandle: h.sourceHandle }
                                : {}),
                            ...(h.targetHandle
                                ? { targetHandle: h.targetHandle }
                                : {}),
                        } as Edge);
                        for (const c of consumers) {
                            edges.push({
                                id: randomUUID(),
                                source: channel.id,
                                target: c.target,
                                type: "custom-edge",
                                ...(c.sourceHandle
                                    ? { sourceHandle: c.sourceHandle }
                                    : {}),
                                ...(c.targetHandle
                                    ? { targetHandle: c.targetHandle }
                                    : {}),
                            } as Edge);
                            links++;
                        }
                    }
                } else {
                    // Producer → this data node (kept as the channel).
                    for (const { n } of execs) {
                        const h = resolveEdgeHandles({
                            sourceType: n.type,
                            targetType: type,
                        });
                        edges.push({
                            id: randomUUID(),
                            source: n.id,
                            target: dn.id,
                            type: "custom-edge",
                            ...(h.sourceHandle
                                ? { sourceHandle: h.sourceHandle }
                                : {}),
                            ...(h.targetHandle
                                ? { targetHandle: h.targetHandle }
                                : {}),
                        } as Edge);
                        links++;
                    }
                }
                // Keep every linked producer's product as an output: add a terminal tap.
                for (const { n, pn } of execs) {
                    if (tapped.has(n.id)) continue;
                    tapped.add(n.id);
                    const tap: Node = {
                        id: randomUUID(),
                        type,
                        position: {
                            x: (n.position?.x ?? 0) + 560,
                            y: (n.position?.y ?? 0) + 260,
                        },
                        data: { label: `${pn.part.owner}/${pn.part.pass}` },
                    } as Node;
                    const h = resolveEdgeHandles({
                        sourceType: n.type,
                        targetType: type,
                    });
                    nodes.push(tap);
                    edges.push({
                        id: randomUUID(),
                        source: n.id,
                        target: tap.id,
                        type: "custom-edge",
                        ...(h.sourceHandle
                            ? { sourceHandle: h.sourceHandle }
                            : {}),
                        ...(h.targetHandle
                            ? { targetHandle: h.targetHandle }
                            : {}),
                    } as Edge);
                    targets[`output_${tap.id.substring(0, 8)}`] = {
                        owner: pn.part.owner,
                        pass: pn.part.pass,
                    };
                }
            }
            if (linkedAny) {
                const nd = { ...(dn.data as Record<string, unknown>) };
                if (remaining.length > 0) nd.fileKeys = remaining;
                else delete nd.fileKeys;
                dn.data = nd as Node["data"];
                if (
                    refs.some((r) => r.ref!.collection) &&
                    remaining.length === 0
                ) {
                    // Collection channel replaced by direct edges: drop the node and its outgoing edges.
                    const idx = nodes.indexOf(dn);
                    if (idx >= 0) nodes.splice(idx, 1);
                    for (let i = edges.length - 1; i >= 0; i--)
                        if (
                            edges[i].source === dn.id ||
                            edges[i].target === dn.id
                        )
                            edges.splice(i, 1);
                }
            }
        }
    }

    // 3. Outputs of the remaining terminal nodes map to their part's target.
    const hasOut = new Set(edges.map((e) => e.source));
    for (const pn of partNodes) {
        for (const n of pn.nodes) {
            if (hasOut.has(n.id) || !nodes.includes(n)) continue;
            const type = n.type ?? "";
            if (
                isAbiNodeType(type) ||
                (type.endsWith("Node") &&
                    OUTPUT_TYPE_BY_NODE[type] &&
                    edges.some((e) => e.target === n.id))
            ) {
                targets[`output_${n.id.substring(0, 8)}`] = {
                    owner: pn.part.owner,
                    pass: pn.part.pass,
                };
            }
        }
    }

    // 4. Save next to the owner as <OWNER>_ALL.tongflow.json.
    const meta: WorkflowFileMeta & { composed?: unknown } = {
        purpose: `Composed from ${parts.length} asset workflow(s) of ${owner}; edit here and re-run to regenerate the whole ${ownerKindOf(owner)}.`,
        targets,
        composed: {
            owner,
            parts: parts.map((p) => ({
                key: p.key,
                owner: p.owner,
                pass: p.pass,
            })),
            at: new Date().toISOString(),
        },
    };
    const store = hydrateStore({
        name: `${owner} — all`,
        flow: { nodes, edges },
        meta,
    });
    try {
        store.getState().autoLayout(undefined, { history: false });
    } catch {
        // layout is cosmetic
    }
    const key = `${toProjectKey(projectRoot, ownerDir(projectRoot, owner))}/${owner}_ALL${WORKFLOW_EXT}`;
    await saveWorkflowFile(projectRoot, key, store, {
        registry,
        meta,
        name: `${owner} — all`,
    });
    return {
        key,
        parts: parts.map((p) => ({ key: p.key, owner: p.owner, pass: p.pass })),
        links,
        unlinked,
        nodeCount: nodes.length,
    };
}

export { basename, DATA_TYPES };
