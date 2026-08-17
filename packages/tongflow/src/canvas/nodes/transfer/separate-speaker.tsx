import { Atom } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { RfDataNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

type SeparateSpeakerRfProps = RfDataNodeProps<"separateSpeakerNode">;

const SeparateSpeakerNode = ({ selected, data }: SeparateSpeakerRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate_speaker");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="separate_speaker"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.separateSpeaker")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startSeparation")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(SeparateSpeakerNode);
