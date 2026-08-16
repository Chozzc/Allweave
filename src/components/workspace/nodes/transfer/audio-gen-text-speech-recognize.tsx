import { Music as AudioIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const AudioGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "transcribe",
    "audioGenTextSpeechRecognizeNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("transcribe");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="transcribe"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechRecognize")}
            icon={<AudioIcon className="h-5 w-5" />}
            executeLabel={t("actions.recognizeSpeech")}
            executeDisabled={!fileKeys.length}
        />
    );
};

AudioGenTextSpeechRecognizeNode.displayName = "AudioGenTextSpeechRecognizeNode";

export default memo(AudioGenTextSpeechRecognizeNode);
