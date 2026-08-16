import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const GetFirstFrameNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"get-first-frame", "getFirstFrameNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("get-first-frame");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="get-first-frame"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.getFirstFrame")}
            icon={<Camera className="h-5 w-5" />}
            executeLabel={t("actions.getFirstFrame")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(GetFirstFrameNode);
