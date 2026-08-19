"use client";

import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "tongflow/canvas";
import { MODAL_CONNECT } from "../settings/connect-configs";
import { TokenConnectDialog } from "../settings/token-connect";

/**
 * Slim persistent banner shown on the canvas until Modal is connected. No
 * dismiss affordance by design — it disappears live the moment the user
 * connects (the connect form flips the shared setup store).
 */
export function SetupBanner() {
    const t = useTranslations("Onboarding");
    const [connectOpen, setConnectOpen] = useState(false);

    return (
        <div className="absolute left-1/2 top-5 z-10 -translate-x-1/2">
            <div className="flex max-w-[90vw] items-center gap-3 rounded-full border border-amber-300 bg-amber-50 py-1.5 pl-4 pr-1.5 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/80">
                <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="truncate text-xs text-amber-900 dark:text-amber-200">
                    {t("bannerText")}
                </span>
                <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-3 text-xs"
                    onClick={() => setConnectOpen(true)}
                >
                    {t("bannerCta")}
                </Button>
            </div>
            <TokenConnectDialog
                config={MODAL_CONNECT}
                open={connectOpen}
                onOpenChange={setConnectOpen}
            />
        </div>
    );
}
