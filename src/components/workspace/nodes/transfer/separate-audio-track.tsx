import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";
import type { RfDataNodeProps } from "tongflow";
import { batchOn } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";
import useFlow from "@/hooks/use-flow";
import type { Task } from "@/hooks/use-task";

import { AbiNodeShell } from "../base/abi-node-shell";

type SeparateAudioTrackRfProps = RfDataNodeProps<"separateAudioTrackNode">;

const SeparateAudioTrackNode = ({
    selected,
    data,
}: SeparateAudioTrackRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate_audio_track");
    const fileKeys = data.fileKeys;
    const expands = useFlow((s) => s.expands);

    // Filter to vocal stems only on task completion.
    const handleTaskUpdate = useCallback(
        (task: Task) => {
            if (task?.status === "COMPLETED") {
                const audioKeys = task?.data?.uploadedFiles as string[];
                if (audioKeys && audioKeys.length > 0) {
                    // Legacy stem uploads embed "_vocals" in the file key;
                    // plugins that return a single AudioRef use opaque keys,
                    // so fall back to every audio output in that case.
                    const vocals = audioKeys.filter((fileKey) =>
                        fileKey.includes("_vocals"),
                    );
                    const keys = vocals.length > 0 ? vocals : audioKeys;
                    expands("", [
                        { type: "audioNode", data: { fileKeys: keys } },
                    ]);
                }
                return true;
            }
            return false;
        },
        [expands],
    );

    return (
        <AbiNodeShell
            feature="separate_audio_track"
            sourceSpec={{ audio: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.separateTrack")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.extractVocals")}
            executeDisabled={!fileKeys?.length}
            onTaskUpdate={handleTaskUpdate}
        />
    );
};

export default memo(SeparateAudioTrackNode);
