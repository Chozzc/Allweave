import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImageNormalNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-normal", "imageNormalNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-normal");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-normal"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.imageNormal")}
            icon={<Layers className="h-5 w-5" />}
            executeLabel={t("actions.estimateNormal")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

ImageNormalNode.displayName = "ImageNormalNode";

export default memo(ImageNormalNode);
