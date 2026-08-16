import { Music as AudioIcon, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "tongflow";
import { useAbiForm } from "@/hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const AudioDescribeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"audio-describe", "audioDescribeNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("audio-describe");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="audio-describe"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.audioDescribe")}
            icon={<AudioIcon className="h-5 w-5" />}
            executeLabel={t("actions.describeAudio")}
            executeDisabled={!fileKeys?.length}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    label={t("audioDescribe.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("audioDescribe.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
            </div>
        </AbiNodeShell>
    );
};

AudioDescribeNode.displayName = "AudioDescribeNode";

export default memo(AudioDescribeNode);
