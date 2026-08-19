import { VolumeX } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const RemoveVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"remove-video-audio", "removeVideoAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("remove-video-audio");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="remove-video-audio"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.removeVideoAudio")}
            icon={<VolumeX className="h-5 w-5" />}
            executeLabel={t("actions.removeVideoAudio")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(RemoveVideoAudioNode);
