"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { getClientTranslator } from "tongflow/canvas";
import { DISCORD_URL, WECHAT_GROUP_QR_SRC } from "@/constants/community";
import { useInChinaTz } from "@/hooks/use-in-china-tz";
import { openExternalUrl } from "@/lib/desktop/open-external";

/**
 * Compact "need help?" line for error surfaces: Discord invite everywhere,
 * plus an expandable WeChat-group QR for mainland-China users. Uses
 * getClientTranslator so it renders fine outside the intl provider tree
 * (e.g. inside react-hot-toast portals).
 */
export function CommunitySupportRow() {
    const t = getClientTranslator("Errors");
    const inChina = useInChinaTz();
    const [qrOpen, setQrOpen] = useState(false);

    return (
        <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("needHelp")}{" "}
                {inChina ? (
                    <>
                        <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setQrOpen((open) => !open)}
                        >
                            {t("wechatGroup")}
                        </button>
                        {" · "}
                    </>
                ) : null}
                <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    onClick={() => openExternalUrl(DISCORD_URL)}
                >
                    Discord
                    <ExternalLink className="h-3 w-3" />
                </button>
            </p>
            {qrOpen ? (
                <div className="mt-2 flex justify-center">
                    <img
                        src={WECHAT_GROUP_QR_SRC}
                        alt={t("wechatQrAlt")}
                        className="h-32 w-32 rounded-lg bg-white p-1.5"
                    />
                </div>
            ) : null}
        </div>
    );
}
