import { Droplets } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { RfDataNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Card } from "../../ui/card";

import { AbiNodeShell } from "../base/abi-node-shell";

type RemoveWatermarkRfProps = RfDataNodeProps<"removeWatermarkNode">;

const RemoveWatermarkNode = ({ selected, data }: RemoveWatermarkRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("remove_watermark");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="remove_watermark"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.removeWatermark")}
            icon={<Droplets className="h-5 w-5" />}
            executeLabel={t("actions.removeWatermark")}
            executeDisabled={!fileKeys?.length}
        >
            <Card className="p-5 space-y-4">
                <div className="text-sm text-muted-foreground">
                    {t("removeWatermark.hint")}
                </div>
            </Card>
        </AbiNodeShell>
    );
};

export default memo(RemoveWatermarkNode);
