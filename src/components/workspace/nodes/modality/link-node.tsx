import { Handle, Position } from "@xyflow/react";
import { Link as LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { RfDataNodeProps } from "tongflow";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";

import { BaseNodeShell } from "../base/base-node-shell";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderComboAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "../base/node-header";

type LinkNodeRfProps = RfDataNodeProps<"linkNode">;

// A linkNode carries URL strings in `texts` (see DATA_NODE_TYPES.linkNode).
const LinkCard = ({ url }: { url: string }) => (
    <div
        className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:shadow-sm transition-all bg-white dark:bg-slate-900"
        title={url}
    >
        <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 shrink-0 text-primary" />
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs hover:underline break-all line-clamp-2"
                onClick={(e) => e.stopPropagation()}
            >
                {url}
            </a>
        </div>
    </div>
);

const LinkNode = ({ selected, data }: LinkNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const urls: string[] = data.texts ?? [];
    const count = urls.length;
    const isSingle = count === 1;

    return (
        <BaseNodeShell selected={selected} count={count}>
            <Handle type="target" position={Position.Left} id="in:linkNode" />
            <Handle type="source" position={Position.Right} id="out:linkNode" />
            <NodeHeader>
                <NodeHeaderIcon>
                    <LinkIcon />
                </NodeHeaderIcon>
                <NodeHeaderTitle>
                    {isSingle ? t("link") : t("links", { count })}
                </NodeHeaderTitle>
                <NodeHeaderActions>
                    <NodeHeaderComboAction onClick={() => {}} />
                    <NodeHeaderMenuAction label={t("moreOptions")}>
                        <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
                    </NodeHeaderMenuAction>
                </NodeHeaderActions>
            </NodeHeader>

            <div className="w-full p-4">
                {count === 0 ? (
                    <div className="flex w-full select-none flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-slate-800/60">
                        <LinkIcon
                            className="h-10 w-10 text-gray-300 dark:text-gray-600"
                            strokeWidth={1.5}
                        />
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("link")}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 min-w-[280px]">
                        {urls.map((url, idx) => (
                            <LinkCard key={idx} url={url} />
                        ))}
                    </div>
                )}
            </div>
        </BaseNodeShell>
    );
};

const areEqual = (prev: LinkNodeRfProps, next: LinkNodeRfProps) =>
    prev.selected === next.selected &&
    JSON.stringify(prev.data.texts ?? []) ===
        JSON.stringify(next.data.texts ?? []);

LinkNode.displayName = "LinkNode";

export default memo(LinkNode, areEqual);
