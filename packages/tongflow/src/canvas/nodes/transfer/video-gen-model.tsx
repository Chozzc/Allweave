import { Move3d } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const VideoGenModelNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-gen-model", "videoGenModelNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-gen-model");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="video-gen-model"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoGenModel")}
            icon={<Move3d className="h-5 w-5" />}
            executeLabel={t("actions.captureMotion")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

VideoGenModelNode.displayName = "VideoGenModelNode";

export default memo(VideoGenModelNode);
