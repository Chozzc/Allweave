import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImageMattingNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-matting", "imageMattingNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-matting");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-matting"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.imageMatting")}
            icon={<Wand2 className="h-5 w-5" />}
            executeLabel={t("actions.extractForeground")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

ImageMattingNode.displayName = "ImageMattingNode";

export default memo(ImageMattingNode);
