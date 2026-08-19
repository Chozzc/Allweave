import { Video as VideoIcon } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const VideoGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "transcribe",
    "videoGenTextSpeechRecognizeNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("transcribe");
    const { fileKeys = [] } = data;

    return (
        <AbiNodeShell
            feature="transcribe"
            // This variant feeds the ABI `audio` field from a videoNode upstream.
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechRecognize")}
            icon={<VideoIcon className="h-5 w-5" />}
            executeLabel={t("actions.describeVideo")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

VideoGenTextSpeechRecognizeNode.displayName = "VideoGenTextSpeechRecognizeNode";

export default memo(VideoGenTextSpeechRecognizeNode);
