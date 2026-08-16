import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const FileGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"parse-document", "fileGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("parse-document");
    const { fileKeys = [] } = data;

    return (
        <AbiNodeShell
            feature="parse-document"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.fileGenText")}
            icon={<FileText className="h-5 w-5" />}
            executeLabel={t("actions.parseDocument")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

FileGenTextNode.displayName = "FileGenTextNode";

export default memo(FileGenTextNode);
