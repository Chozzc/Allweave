import { Atom } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const DropVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"drop-video", "dropVideoNode">) => {
    const t = useTranslations("Workspace.nodes.batch");
    const form = useAbiForm("drop-video");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="drop-video"
            form={form}
            selected={selected}
            data={data}
            title={t("videoFilter")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("startFilter")}
            executeDisabled={!fileKeys?.length}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    cardClassName="p-5"
                    rows={6}
                    placeholder={t("describeRequirements")}
                    {...form.bind("query")}
                />
            </div>
        </AbiNodeShell>
    );
};

export default memo(DropVideoNode);
