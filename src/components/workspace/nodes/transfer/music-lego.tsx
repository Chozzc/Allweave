import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Layers, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";
import { MUSIC_TRACK_OPTIONS } from "./music-extract";

const MusicLegoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-lego", "musicLegoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("music-lego");

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);
    const audioConnected = useMemo(
        () =>
            !!nodeId &&
            edges.some(
                (e) => e.target === nodeId && e.targetHandle === "in:audio",
            ),
        [edges, nodeId],
    );

    const track = (form.state.track as string | undefined) ?? "";

    return (
        <AbiNodeShell
            feature="music-lego"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.musicLego")}
            icon={<Layers className="h-5 w-5" />}
            executeLabel={t("actions.addTrack")}
            executeDisabled={!audioConnected || !track}
        >
            <div className="p-4 space-y-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t("musicTasks.track")}
                        </Label>
                        <Select
                            value={track}
                            onValueChange={(v) => form.set("track", v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue
                                    placeholder={t("musicTasks.track")}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {MUSIC_TRACK_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt}
                                        value={opt}
                                        className="text-xs"
                                    >
                                        {t(`musicTasks.trackOptions.${opt}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </Card>
                <NodeTextarea
                    label={t("musicTasks.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("musicTasks.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
                <NodeTextarea
                    label={t("musicTasks.lyricsLabel")}
                    placeholder={t("musicTasks.lyricsPlaceholder")}
                    {...form.bind("lyrics")}
                    rows={2}
                />
            </div>
        </AbiNodeShell>
    );
};

MusicLegoNode.displayName = "MusicLegoNode";

export default memo(MusicLegoNode);
