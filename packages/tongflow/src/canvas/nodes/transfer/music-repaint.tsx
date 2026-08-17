import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Brush, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Slider } from "../../ui/slider";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const DEFAULT_STRENGTH = 0.3;

const MusicRepaintNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-repaint", "musicRepaintNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("music-repaint");

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

    const startTime = form.state.start_time as number | undefined;
    const endTime = form.state.end_time as number | undefined;
    const strength =
        (form.state.strength as number | undefined) ?? DEFAULT_STRENGTH;

    // Persist the default so the workflow exporter / runtime sees the same
    // value the user sees in the UI.
    useEffect(() => {
        if (form.state.strength == null)
            form.set("strength", DEFAULT_STRENGTH, { history: false });
    }, [form.state.strength, form.set]);

    return (
        <AbiNodeShell
            feature="music-repaint"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.musicRepaint")}
            icon={<Brush className="h-5 w-5" />}
            executeLabel={t("actions.repaintMusic")}
            executeDisabled={
                !audioConnected || startTime == null || endTime == null
            }
        >
            <div className="p-4 space-y-4">
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
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("musicTasks.startTime")}
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                step={0.1}
                                value={startTime ?? ""}
                                onChange={(e) =>
                                    form.set(
                                        "start_time",
                                        e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value),
                                    )
                                }
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("musicTasks.endTime")}
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                step={0.1}
                                value={endTime ?? ""}
                                onChange={(e) =>
                                    form.set(
                                        "end_time",
                                        e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value),
                                    )
                                }
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                </Card>
                <Card className="p-3">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("musicTasks.strength")}
                            </Label>
                            <span className="text-xs font-medium">
                                {strength.toFixed(2)}
                            </span>
                        </div>
                        <Slider
                            value={[strength]}
                            onValueChange={([v]) => form.set("strength", v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                        />
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

MusicRepaintNode.displayName = "MusicRepaintNode";

export default memo(MusicRepaintNode);
