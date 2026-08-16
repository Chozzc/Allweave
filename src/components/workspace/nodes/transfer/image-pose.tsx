import { PersonStanding } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { batchOn } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

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
            sourceSpec={{ image: batchOn() }}
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
