import { Film } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const GetLastFrameNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"get-last-frame", "getLastFrameNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("get-last-frame");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="get-last-frame"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.getLastFrame")}
            icon={<Film className="h-5 w-5" />}
            executeLabel={t("actions.getLastFrame")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(GetLastFrameNode);
