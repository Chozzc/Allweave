import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import type { SourceSpec, TongflowPluginNodeProps } from "tongflow";
import { coerceBaseNodeData, NODE_TYPE_SOURCE_SPEC } from "tongflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const BRIEF_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.musicBriefNode as SourceSpec<"music-brief">;

function buildLanguageOptions(tLang: (key: string) => string) {
    return [
        { value: "zh", label: tLang("zh") },
        { value: "en", label: tLang("en") },
        { value: "cantonese", label: tLang("yue") },
        { value: "ja", label: tLang("ja") },
        { value: "ko", label: tLang("ko") },
        { value: "fr", label: tLang("fr") },
        { value: "es", label: tLang("es") },
    ];
}

const MusicBriefNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-brief", "musicBriefNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tLang = useTranslations("Languages");
    const LANGUAGE_OPTIONS = buildLanguageOptions(tLang);
    const form = useAbiForm("music-brief", BRIEF_SOURCE_SPEC);

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);

    const textSourceId = useMemo(() => {
        if (!nodeId) return null;
        for (const e of edges) {
            if (e.target === nodeId && e.targetHandle === "in:text") {
                return e.source;
            }
        }
        return null;
    }, [edges, nodeId]);

    const upstreamIds = useMemo(
        () => (textSourceId ? [textSourceId] : []),
        [textSourceId],
    );
    const upstreamNodes = useNodesData(upstreamIds);

    const textUpstream = useMemo(() => {
        if (!textSourceId) return null;
        const n = upstreamNodes.find((u) => u.id === textSourceId);
        if (!n || n.type !== "textNode") return null;
        return coerceBaseNodeData(n.data).texts?.[0] ?? "";
    }, [textSourceId, upstreamNodes]);

    const textLocal = (form.state.text as string | undefined) ?? "";
    const textDisplay = textUpstream !== null ? textUpstream : textLocal;
    const instrumental =
        (form.state.instrumental as boolean | undefined) ?? false;
    const language = (form.state.language as string | undefined) ?? "zh";

    return (
        <AbiNodeShell
            feature="music-brief"
            sourceSpec={BRIEF_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.musicBrief")}
            icon={<Lightbulb className="h-5 w-5" />}
            executeLabel={t("actions.musicBrief")}
            executeDisabled={!textDisplay.trim()}
        >
            <div className="p-4 space-y-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                        {t("musicTasks.promptLabel")}
                    </Label>
                    <Textarea
                        placeholder={
                            textUpstream !== null
                                ? t("music.fromUpstreamReadonly")
                                : t("musicTasks.ideaPlaceholder")
                        }
                        value={textDisplay}
                        onChange={(e) => form.set("text", e.target.value)}
                        readOnly={textUpstream !== null}
                        rows={3}
                        className="max-h-[120px] resize-none text-xs whitespace-pre-wrap break-words overflow-auto"
                    />
                </Card>
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="music-brief-instrumental"
                                checked={instrumental}
                                onCheckedChange={(v) =>
                                    form.set("instrumental", v)
                                }
                            />
                            <Label
                                htmlFor="music-brief-instrumental"
                                className="text-xs text-muted-foreground"
                            >
                                {t("musicTasks.instrumental")}
                            </Label>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("music.language")}
                            </Label>
                            <Select
                                value={language}
                                onValueChange={(v) => form.set("language", v)}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LANGUAGE_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                            className="text-xs"
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

MusicBriefNode.displayName = "MusicBriefNode";

export default memo(MusicBriefNode);
