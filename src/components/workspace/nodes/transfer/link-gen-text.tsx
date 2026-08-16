import { Link as LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { batchOn } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const LinkGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"link", "linkGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("link");
    // The upstream linkNode's URL(s) are synced into `texts` (see the
    // `url` handle in NODE_TYPE_SOURCE_SPEC.linkGenTextNode).
    const { texts = [] } = data;

    return (
        <AbiNodeShell
            feature="link"
            sourceSpec={{
                url: batchOn({ nodeType: "linkNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.linkGenText")}
            icon={<LinkIcon className="h-5 w-5" />}
            executeLabel={t("actions.extractContent")}
            executeDisabled={!texts?.length}
        />
    );
};

LinkGenTextNode.displayName = "LinkGenTextNode";

export default memo(LinkGenTextNode);
