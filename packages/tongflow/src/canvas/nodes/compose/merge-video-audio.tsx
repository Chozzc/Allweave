import { Atom } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const MergeVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"merge-video-audio", "mergeVideoAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("merge-video-audio");

    return (
        <AbiNodeShell
            feature="merge-video-audio"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.mergeVideoAudio")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startMerge")}
        />
    );
};

export default memo(MergeVideoAudioNode);
