import { Atom } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { RfDataNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

type DenoiseAudioRfProps = RfDataNodeProps<"denoiseAudioSubtitleNode">;

const DenoiseAudioNode = ({ selected, data }: DenoiseAudioRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("denoise_audio");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="denoise_audio"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.denoiseAudio")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startDenoise")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(DenoiseAudioNode);
