import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { MessageSquare, PackagePlus } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";
import { MUSIC_TRACK_OPTIONS } from "./music-extract";

const MusicCompleteNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-complete", "musicCompleteNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("music-complete");

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

    const tracks = (form.state.tracks as string[] | undefined) ?? [];

    const toggleTrack = (track: string) => {
        const next = tracks.includes(track)
            ? tracks.filter((v) => v !== track)
            : [...tracks, track];
        form.set("tracks", next);
    };

    return (
        <AbiNodeShell
            feature="music-complete"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.musicComplete")}
            icon={<PackagePlus className="h-5 w-5" />}
            executeLabel={t("actions.completeMusic")}
            executeDisabled={!audioConnected}
        >
            <div className="p-4 space-y-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("musicTasks.tracks")}
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                            {MUSIC_TRACK_OPTIONS.map((opt) => (
                                <Button
                                    key={opt}
                                    size="sm"
                                    variant={
                                        tracks.includes(opt)
                                            ? "secondary"
                                            : "outline"
                                    }
                                    className="h-7 px-2.5 text-xs rounded-full"
                                    onClick={() => toggleTrack(opt)}
                                >
                                    {t(`musicTasks.trackOptions.${opt}`)}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Card>
                <NodeTextarea
                    label={t("musicTasks.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("musicTasks.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
            </div>
        </AbiNodeShell>
    );
};

MusicCompleteNode.displayName = "MusicCompleteNode";

export default memo(MusicCompleteNode);
