import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { AudioLines } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const SeparateSoundNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"separate-sound", "separateSoundNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate-sound");

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);
    const { audioConnected, textConnected } = useMemo(
        () => ({
            audioConnected:
                !!nodeId &&
                edges.some(
                    (e) => e.target === nodeId && e.targetHandle === "in:audio",
                ),
            textConnected:
                !!nodeId &&
                edges.some(
                    (e) => e.target === nodeId && e.targetHandle === "in:text",
                ),
        }),
        [edges, nodeId],
    );

    const text = (form.state.text as string | undefined) ?? "";

    return (
        <AbiNodeShell
            feature="separate-sound"
            form={form}
            selected={selected}
            className="min-w-[420px]"
            data={data}
            title={t("titles.separateSound")}
            icon={<AudioLines className="h-5 w-5" />}
            executeLabel={t("actions.separateSound")}
            executeDisabled={
                !audioConnected || (!textConnected && !text.trim())
            }
        >
            <div className="p-4 space-y-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t("separateSound.textLabel")}
                        </Label>
                        <NodeTextarea
                            showCard={false}
                            placeholder={t("separateSound.textPlaceholder")}
                            {...form.bind("text")}
                            rows={3}
                        />
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

SeparateSoundNode.displayName = "SeparateSoundNode";

export default memo(SeparateSoundNode);
