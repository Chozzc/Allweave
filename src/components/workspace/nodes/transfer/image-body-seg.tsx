import { Puzzle } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { batchOn } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImageBodySegNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-body-seg", "imageBodySegNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-body-seg");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-body-seg"
            sourceSpec={{ image: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.imageBodySeg")}
            icon={<Puzzle className="h-5 w-5" />}
            executeLabel={t("actions.segmentBody")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

ImageBodySegNode.displayName = "ImageBodySegNode";

export default memo(ImageBodySegNode);
