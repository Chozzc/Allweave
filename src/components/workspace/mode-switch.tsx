"use client";

import { AppWindow, Play, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    cn,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    useTaskStore,
    WORKSPACE_MODE_KEY,
    type WorkspaceMode,
} from "tongflow/canvas";

interface ModeSwitchProps {
    onChange?: (mode: WorkspaceMode) => void;
}

const MODES: {
    mode: WorkspaceMode;
    icon: React.ComponentType<{ className?: string }>;
    labelKey: string;
    activeClass: string;
}[] = [
    {
        mode: "create",
        icon: Sparkles,
        labelKey: "createMode",
        activeClass: "bg-violet-500 text-white",
    },
    {
        mode: "execute",
        icon: Play,
        labelKey: "executeMode",
        activeClass: "bg-emerald-500 text-white",
    },
    {
        mode: "app",
        icon: AppWindow,
        labelKey: "appMode",
        activeClass: "bg-sky-500 text-white",
    },
];

const VALID_MODES: WorkspaceMode[] = ["create", "execute", "app"];

/**
 * Segmented control switching between create / execute / app modes
 */
export function ModeSwitch({ onChange }: ModeSwitchProps) {
    const t = useTranslations("Workspace.modeSwitch");
    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const setWorkspaceMode = useTaskStore((state) => state.setWorkspaceMode);
    const [mounted, setMounted] = useState(false);
    // Control the tooltip via hover/focus so clicking a segment (a pointer-down
    // on the trigger) doesn't dismiss it the way Radix's default behavior does.
    const [tooltipOpen, setTooltipOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedMode = localStorage.getItem(
            WORKSPACE_MODE_KEY,
        ) as WorkspaceMode | null;
        if (savedMode && VALID_MODES.includes(savedMode)) {
            setWorkspaceMode(savedMode);
        }
    }, [setWorkspaceMode]);

    const handleModeChange = (mode: WorkspaceMode) => {
        setWorkspaceMode(mode);
        onChange?.(mode);
    };

    if (!mounted) {
        return (
            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/50 dark:border-gray-500/60">
                <div className="w-24 h-6" />
            </div>
        );
    }

    const activeLabelKey =
        MODES.find((m) => m.mode === workspaceMode)?.labelKey ?? "createMode";

    return (
        <Tooltip open={tooltipOpen}>
            <TooltipTrigger asChild>
                <div
                    className="flex items-center gap-1 p-1.5 rounded-xl bg-background/80 backdrop-blur-md border border-border/50 dark:border-gray-500/60 transition-all duration-300 hover:border-border dark:hover:border-gray-400/70"
                    onPointerEnter={() => setTooltipOpen(true)}
                    onPointerLeave={() => setTooltipOpen(false)}
                    onFocus={() => setTooltipOpen(true)}
                    onBlur={() => setTooltipOpen(false)}
                >
                    {MODES.map(({ mode, icon: Icon, activeClass }) => (
                        <button
                            key={mode}
                            type="button"
                            aria-pressed={workspaceMode === mode}
                            onClick={() => handleModeChange(mode)}
                            className={cn(
                                "flex items-center justify-center size-7 rounded-lg cursor-pointer transition-all duration-200",
                                workspaceMode === mode
                                    ? activeClass
                                    : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700/50",
                            )}
                        >
                            <Icon className="size-4" />
                        </button>
                    ))}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top">{t(activeLabelKey)}</TooltipContent>
        </Tooltip>
    );
}
