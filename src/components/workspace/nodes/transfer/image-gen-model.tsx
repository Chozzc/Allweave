import { Box } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImageGenModelNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-model", "imageGenModelNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-gen-model");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-gen-model"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenModel")}
            icon={<Box className="h-5 w-5" />}
            executeLabel={t("actions.generate3DModel")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

ImageGenModelNode.displayName = "ImageGenModelNode";

export default memo(ImageGenModelNode);
