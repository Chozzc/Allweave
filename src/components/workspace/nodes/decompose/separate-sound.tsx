import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { AudioLines } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import type { SourceSpec, TongflowPluginNodeProps } from "tongflow";
import { NODE_TYPE_SOURCE_SPEC } from "tongflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

// `audio` comes from an upstream audioNode; `text` may come from an upstream
// textNode (via the auto-rendered `in:text` handle) or be typed manually — the
// upstream edge wins, the textarea value is the fallback (`manual: true`).
// Defined centrally in NODE_TYPE_SOURCE_SPEC so compose-time edge creation
// assigns the correct `in:text` targetHandle.
const sourceSpec =
    NODE_TYPE_SOURCE_SPEC.separateSoundNode as SourceSpec<"separate-sound">;

const SeparateSoundNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"separate-sound", "separateSoundNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate-sound", sourceSpec);

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
            sourceSpec={sourceSpec}
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
