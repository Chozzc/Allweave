import { useState } from "react";
import type { Pass, TreeNode } from "../../shared/types.ts";
import { useT } from "./common.tsx";

const ICONS: Record<TreeNode["kind"], string> = {
    folder: "📁",
    file: "📄",
    entity: "🎭",
    shot: "🎬",
    episode: "📺",
    scene: "🎞",
    workflow: "🧩",
    take: "🖼",
};

const LABEL_KEYS: Record<
    string,
    | "script"
    | "bible"
    | "episodes"
    | "workflows"
    | "inbox"
    | "dailies"
    | "delivery"
    | "post"
> = {
    dev: "script",
    bible: "bible",
    episodes: "episodes",
    workflows: "workflows",
    inbox: "inbox",
    dailies: "dailies",
    delivery: "delivery",
};

function Dots({ meta }: { meta?: Record<string, unknown> }) {
    const counts = (meta?.takeCounts ?? {}) as Partial<Record<Pass, number>>;
    const circled = (meta?.circled ?? {}) as Partial<Record<Pass, string>>;
    const passes = Object.keys({ ...counts, ...circled }) as Pass[];
    if (passes.length === 0) return null;
    return (
        <span className="tfs-dots">
            {passes.map((p) => (
                <span
                    key={p}
                    className={`tfs-dot${circled[p] ? " circled" : counts[p] ? " some" : ""}`}
                    title={`${p}: ${counts[p] ?? 0} take(s)${circled[p] ? `, circled ${circled[p]}` : ""}`}
                />
            ))}
        </span>
    );
}

function Row({
    node,
    depth,
    selectedId,
    onSelect,
    defaultOpen,
    label,
}: {
    node: TreeNode;
    depth: number;
    selectedId?: string;
    onSelect: (n: TreeNode) => void;
    defaultOpen: boolean;
    label?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isPassFolder = node.kind === "folder" && Boolean(node.meta?.owner);
    return (
        <div>
            <div
                className={`tfs-tree-row${selectedId === node.id ? " selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => {
                    if (hasChildren && node.kind === "folder" && !isPassFolder)
                        setOpen((o) => !o);
                    else if (hasChildren)
                        setOpen((o) => (selectedId === node.id ? !o : true));
                    onSelect(node);
                }}
            >
                <span className="tfs-tree-caret">
                    {hasChildren ? (open ? "▾" : "▸") : ""}
                </span>
                <span className="tfs-tree-icon">
                    {isPassFolder ? "▫" : ICONS[node.kind]}
                </span>
                <span className="tfs-tree-label">{label ?? node.label}</span>
                {isPassFolder ? null : <Dots meta={node.meta} />}
                {node.kind === "folder" && !isPassFolder && hasChildren ? (
                    <span className="tfs-badge">{node.children!.length}</span>
                ) : null}
            </div>
            {open && hasChildren
                ? node.children!.map((c) => (
                      <Row
                          key={c.id}
                          node={c}
                          depth={depth + 1}
                          selectedId={selectedId}
                          onSelect={onSelect}
                          defaultOpen={depth < 1}
                      />
                  ))
                : null}
        </div>
    );
}

export function TreePane({
    tree,
    selectedId,
    onSelect,
}: {
    tree: TreeNode[];
    selectedId?: string;
    onSelect: (n: TreeNode) => void;
}) {
    const t = useT();
    return (
        <div className="tfs-tree">
            {tree.map((n) => (
                <Row
                    key={n.id}
                    node={n}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    defaultOpen={
                        n.id === "bible" ||
                        n.id === "episodes" ||
                        n.id === "workflows"
                    }
                    label={LABEL_KEYS[n.id] ? t(LABEL_KEYS[n.id]) : undefined}
                />
            ))}
        </div>
    );
}
