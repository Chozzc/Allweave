import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Video } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { collectHandleValues } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { useNodeAbiSpec } from "../../hooks/use-node-abi-spec";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";

const ConcatVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"concat-videos", "concatVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("concat-videos");

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useNodeAbiSpec("concat-videos");

    // Collect upstream video fileKeys from incoming edges so the editor view
    // reflects connections live (both manual drags and compose-created edges),
    // not just `data.fileKeys` populated after execution.
    const videoFileKeys = useMemo(() => {
        const collected = nodeId
            ? collectHandleValues(
                  nodeId,
                  resolvedSpec,
                  Array.from(nodeLookup.values()),
                  edges,
              ).videos
            : undefined;
        if (Array.isArray(collected) && collected.length > 0) {
            return collected.filter(
                (key): key is string => typeof key === "string",
            );
        }
        return (data.fileKeys ?? []) as string[];
    }, [nodeId, resolvedSpec, nodeLookup, edges, data.fileKeys]);

    return (
        <AbiNodeShell
            feature="concat-videos"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.concatVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("actions.concatVideo")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.videoFiles")} ({videoFileKeys.length})
                        </Label>
                        <div className="flex flex-wrap gap-4">
                            {videoFileKeys.length > 0 ? (
                                videoFileKeys.map((fileKey, index) => (
                                    <MediaThumbnail
                                        key={`${fileKey}-${index}`}
                                        fileKey={fileKey}
                                        label={`${t("compose.video")} ${index + 1}`}
                                        type="video"
                                        loadingText={t("compose.loading")}
                                    />
                                ))
                            ) : (
                                <p className="text-xs text-red-500">
                                    {t("compose.connectVideo")}
                                </p>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

export default memo(ConcatVideoNode);
