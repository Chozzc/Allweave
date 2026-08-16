import { Handle, Position, useNodeId, useNodesData } from "@xyflow/react";
import { Link as LinkIcon, Plus, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo, useState } from "react";
import type { RfDataNodeProps } from "tongflow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";

import { BaseNodeShell } from "../base/base-node-shell";

// Add-link is an input node: it collects URL(s) and, like the other add nodes,
// spawns its modality asset node (`linkNode`) downstream via `expands`. The URLs
// are carried in the linkNode's `texts` field. Content extraction (the `link`
// ABI feature) is a separate transform run on the linkNode.
const AddLinkNode = ({ selected, data }: RfDataNodeProps<"addLinkNode">) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const expands = useFlow((s) => s.expands);
    const updateNode = useFlow((s) => s.updates);
    const edges = useFlow((s) => s.edges);

    const [state, updateState] = useNodeState({ urls: [] as string[] }, data);
    const urls = state.urls;
    const [input, setInput] = useState("");

    const downstreamId = useMemo(
        () => edges.find((e) => e.source === id)?.target,
        [edges, id],
    );
    const downstreamData = useNodesData(downstreamId ? [downstreamId] : []);

    const setUrls = (next: string[]) => {
        updateState({ urls: next });
        // Keep an already-spawned linkNode in sync with edits.
        if (downstreamId) {
            updateNode(downstreamId, {
                ...downstreamData[0]?.data,
                texts: next,
            });
        }
    };

    const handleAddUrl = () => {
        const match = input.trim().match(/https?:\/\/[^\s]+/);
        if (!match) return;
        setUrls([...urls, match[0]]);
        setInput("");
    };

    const handleRemove = (index: number) => {
        setUrls(urls.filter((_, i) => i !== index));
    };

    const handleCreate = () => {
        if (!urls.length || !id || downstreamId) return;
        expands(id, [{ type: "linkNode", data: { texts: urls } }]);
    };

    return (
        <BaseNodeShell
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("addLink")}
            icon={<LinkIcon className="h-5 w-5" />}
            isInputNode
            showPluginSelect={false}
        >
            <Handle type="source" position={Position.Right} id="out:linkNode" />
            <div className="p-4 space-y-2">
                {urls.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {urls.map((url, idx) => (
                            <Card
                                key={idx}
                                className="p-3 relative rounded-lg border hover:shadow-sm transition-all"
                            >
                                <button
                                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={() => handleRemove(idx)}
                                >
                                    <Trash size={14} />
                                </button>
                                <div className="pr-6">
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary text-xs hover:underline break-all line-clamp-2"
                                    >
                                        {url}
                                    </a>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                <div
                    className="flex gap-2 items-center nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Input
                        placeholder={t("linkPlaceholder")}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 h-10"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddUrl();
                            }
                        }}
                    />
                    <Button
                        variant="outline"
                        size="default"
                        onClick={handleAddUrl}
                        className="h-10 px-3"
                    >
                        <Plus size={16} />
                    </Button>
                </div>

                <Button
                    onClick={handleCreate}
                    disabled={!urls.length || !!downstreamId}
                    className="w-full h-10"
                >
                    {t("addLink")}
                </Button>
            </div>
        </BaseNodeShell>
    );
};

AddLinkNode.displayName = "AddLinkNode";

export default memo(AddLinkNode);
