"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";

// Matches navBtnClass in workspace-nav.tsx so the toggle sits naturally in
// the top-right cluster.
const btnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

export function AgentToggleButton() {
    const t = useTranslations("Agent");
    const { open, toggle } = useAgentChat();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    className={cn(
                        btnClass,
                        open &&
                            "text-gray-900 bg-gray-50 dark:text-white dark:bg-zinc-700",
                    )}
                >
                    <Bot className="h-5 w-5" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{t("title")}</TooltipContent>
        </Tooltip>
    );
}
