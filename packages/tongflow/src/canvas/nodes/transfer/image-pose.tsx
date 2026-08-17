import { PersonStanding } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImagePoseNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-pose", "imagePoseNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-pose");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-pose"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.imagePose")}
            icon={<PersonStanding className="h-5 w-5" />}
            executeLabel={t("actions.detectPose")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

ImagePoseNode.displayName = "ImagePoseNode";

export default memo(ImagePoseNode);
