import { useState } from "react";
import type { Pass, TreeNode } from "../../shared/types.ts";

export interface Selection {
    node: TreeNode;
}

const ICONS: Record<TreeNode["kind"], string> = {
    folder: "▪",
    file: "·",
    entity: "◉",
    shot: "▣",
    episode: "▦",
    scene: "▤",
    workflow: "⧉",
    take: "◇",
};

function Dots({ meta }: { meta?: Record<string, unknown> }) {
    const counts = (meta?.takeCounts ?? {}) as Partial<Record<Pass, number>>;
    const circled = (meta?.circled ?? {}) as Partial<Record<Pass, string>>;
    const passes = Object.keys({ ...counts, ...circled }) as Pass[];
    if (passes.length === 0) return null;
    return (
        <span className="tfs-dots">
            {passes.map((p) => (
                <span key={p} className={`tfs-dot${circled[p] ? " circled" : counts[p] ? " some" : ""}`} title={`${p}: ${counts[p] ?? 0} take(s)${circled[p] ? `, circled ${circled[p]}` : ""}`} />
            ))}
        </span>
    );
}

function Row({ node, depth, selectedId, onSelect, defaultOpen }: { node: TreeNode; depth: number; selectedId?: string; onSelect: (n: TreeNode) => void; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const hasChildren = (node.children?.length ?? 0) > 0;
    return (
        <div>
            <div
                className={`tfs-tree-row${selectedId === node.id ? " selected" : ""}`}
                style={{ paddingLeft: 6 + depth * 12 }}
                onClick={() => {
                    if (hasChildren && node.kind === "folder" && !node.meta?.owner) setOpen((o) => !o);
                    else if (hasChildren) setOpen((o) => (selectedId === node.id ? !o : true));
                    onSelect(node);
                }}
            >
                <span className="tfs-tree-caret">{hasChildren ? (open ? "▾" : "▸") : ""}</span>
                <span className="tfs-tree-icon">{ICONS[node.kind]}</span>
                <span className="tfs-tree-label">{node.label}</span>
                {node.kind === "folder" && node.meta?.owner ? null : <Dots meta={node.meta} />}
                {node.kind === "folder" && !node.meta?.owner && hasChildren ? <span className="tfs-badge">{node.children!.length}</span> : null}
            </div>
            {open && hasChildren
                ? node.children!.map((c) => <Row key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} defaultOpen={depth < 1} />)
                : null}
        </div>
    );
}

export function TreePane({ tree, selectedId, onSelect }: { tree: TreeNode[]; selectedId?: string; onSelect: (n: TreeNode) => void }) {
    return (
        <div className="tfs-tree">
            {tree.map((n) => (
                <Row key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} defaultOpen={n.id === "bible" || n.id === "episodes" || n.id === "workflows"} />
            ))}
        </div>
    );
}
