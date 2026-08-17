"use client";

/**
 * One-click canvas tidy: layered auto-layout over the whole graph.
 * Undoable with a single Cmd+Z; a no-op when nothing would move.
 */

import { useReactFlow } from "@xyflow/react";
import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    useFlow,
} from "tongflow/canvas";

const BUTTON_CLASS =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 disabled:opacity-40 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200";

export function TidyLayoutButton() {
    const t = useTranslations("Navigation");
    const { fitView } = useReactFlow();

    const handleTidy = () => {
        const changed = useFlow.getState().autoLayout();
        if (changed) {
            // Wait one frame so React Flow picks up the new positions.
            setTimeout(() => {
                void fitView({ duration: 800, padding: 0.2 });
            }, 50);
        }
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleTidy}
                    aria-label={t("tidyLayout")}
                    className={BUTTON_CLASS}
                >
                    <LayoutGrid className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("tidyLayout")}</TooltipContent>
        </Tooltip>
    );
}
