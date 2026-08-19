import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Clapperboard, Sparkles } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { collectHandleValues } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { useNodeAbiSpec } from "../../hooks/use-node-abi-spec";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const VideoEditNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-edit", "videoEditNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-edit");

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useNodeAbiSpec("video-edit");

    const { hasVideo, promptText } = useMemo(() => {
        if (!nodeId) {
            return { hasVideo: false, promptText: "" };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const videoRaw = values.video;
        const videoKey = Array.isArray(videoRaw)
            ? typeof videoRaw[0] === "string"
                ? videoRaw[0]
                : undefined
            : typeof videoRaw === "string"
              ? videoRaw
              : undefined;
        return {
            hasVideo: Boolean(videoKey),
            promptText: text,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const manualText = (form.state.text as string | undefined)?.trim() ?? "";
    const effectiveText = promptText || manualText;

    return (
        <AbiNodeShell
            feature="video-edit"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoEdit")}
            icon={<Clapperboard className="h-5 w-5" />}
            executeLabel={t("actions.editVideo")}
            executeDisabled={!hasVideo || !effectiveText}
        >
            <div className="p-4 space-y-4">
                {!hasVideo && (
                    <p className="text-xs text-red-500">
                        {t("videoEdit.connectTextVideo")}
                    </p>
                )}

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("videoEdit.editInstruction")}
                                {t("videoEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("videoEdit.editInstruction")}
                        icon={Sparkles}
                        placeholder={t("videoEdit.editPlaceholder")}
                        {...form.bind("text")}
                        rows={4}
                    />
                )}
            </div>
        </AbiNodeShell>
    );
};

VideoEditNode.displayName = "VideoEditNode";

export default memo(VideoEditNode);
