import { useNodesData } from "@xyflow/react";
import { Clapperboard, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useRef } from "react";

import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { useUpstreamNodeIds } from "@/hooks/use-upstream-ids";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import type { SourceSpec } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

// Omni-reference limits (MiniMax-H3, the reference implementation): up to 9
// images, 3 video clips, 3 audio clips, 12 files total.
const MAX_IMAGES = 9;
const MAX_VIDEOS = 3;
const MAX_AUDIOS = 3;

// `images` / `videos` / `audios` each collect every connected edge of their
// media kind. `text` may come from an upstream textNode (via the auto-rendered
// `in:text` handle) or be typed manually — the upstream edge wins, the textarea
// value is the fallback (`manual: true`). Defined centrally in
// NODE_TYPE_SOURCE_SPEC so compose-time edge creation assigns the correct
// targetHandle (matching sibling compose nodes).
const sourceSpec =
    NODE_TYPE_SOURCE_SPEC.refsGenVideoNode as SourceSpec<"refs-gen-video">;

const RefsGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"refs-gen-video", "refsGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("refs-gen-video", sourceSpec);

    const ids = useUpstreamNodeIds(data.ids);
    const fromNodes = useNodesData(ids);

    const collectKeys = (nodeType: string): string[][] =>
        fromNodes
            .filter((node) => node.type === nodeType)
            .map((node) => coerceBaseNodeData(node.data).fileKeys)
            .filter((keys): keys is string[] => !!keys && keys.length > 0);

    const allImages = collectKeys("imageNode");
    const allVideos = collectKeys("videoNode");
    const allAudios = collectKeys("audioNode");
    const totalRefs = allImages.length + allVideos.length + allAudios.length;

    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode?.data).texts || [];
        return [];
    }, [textNode]);
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    const width = (form.state.width as number | undefined) ?? 1280;
    const height = (form.state.height as number | undefined) ?? 720;
    const duration = (form.state.duration as number | undefined) ?? 5;
    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    const userPrompt = (form.state.text as string | undefined) ?? "";
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertRefLabel = useCallback(
        (refLabel: string) => {
            if (!textareaRef.current) return;
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText =
                userPrompt.substring(0, start) +
                refLabel +
                userPrompt.substring(end);
            form.set("text", newText);
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + refLabel.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        },
        [userPrompt, form],
    );

    const referenceRow = (
        refs: string[][],
        max: number,
        type: "image" | "video" | "audio",
        sectionLabel: string,
        itemLabel: string,
    ) => (
        <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
                {sectionLabel}
                <span className="ml-2 text-xs font-normal">
                    ({refs.length}/{max})
                </span>
            </span>
            <div className="flex gap-3 flex-wrap">
                {refs.slice(0, max).map((keys, index) => (
                    <MediaThumbnail
                        key={index}
                        fileKey={keys[0]}
                        label={`${itemLabel}${index + 1}`}
                        type={type}
                        onClick={() =>
                            insertRefLabel(`${itemLabel}${index + 1}`)
                        }
                    />
                ))}
            </div>
        </div>
    );

    return (
        <AbiNodeShell
            feature="refs-gen-video"
            sourceSpec={sourceSpec}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.refsGenVideo")}
            icon={<Clapperboard className="h-5 w-5" />}
            executeLabel={t("actions.generateVideo")}
            executeDisabled={totalRefs < 1}
        >
            <div className="p-4 space-y-4">
                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />

                <DurationPicker
                    durations={VIDEO_DURATIONS}
                    value={String(duration)}
                    onChange={(dur) => form.set("duration", Number(dur))}
                />

                {referenceRow(
                    allImages,
                    MAX_IMAGES,
                    "image",
                    t("imageFusion.imageReference"),
                    t("imageFusion.imageLabel"),
                )}
                {allVideos.length > 0 &&
                    referenceRow(
                        allVideos,
                        MAX_VIDEOS,
                        "video",
                        t("refsGenVideo.videoReference"),
                        t("refsGenVideo.videoLabel"),
                    )}
                {allAudios.length > 0 &&
                    referenceRow(
                        allAudios,
                        MAX_AUDIOS,
                        "audio",
                        t("refsGenVideo.audioReference"),
                        t("refsGenVideo.audioLabel"),
                    )}
                <p className="text-xs text-muted-foreground">
                    {t("refsGenVideo.referenceHint")}
                </p>

                {hasUpstreamTexts ? (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("imageFusion.fusionPrompt")}
                            {t("imageEdit.fromUpstream")}
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {upstreamTexts.map((text, index) => (
                                <div
                                    key={index}
                                    className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("imageFusion.fusionPrompt")}
                        </span>
                        <NodeTextarea
                            ref={textareaRef}
                            showCard={false}
                            placeholder={t("refsGenVideo.promptPlaceholder")}
                            {...form.bind("text")}
                            rows={4}
                        />
                    </div>
                )}
            </div>
        </AbiNodeShell>
    );
};

export default memo(RefsGenVideoNode);
