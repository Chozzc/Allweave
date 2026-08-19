"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";

export type NodePluginSelectOption = {
    value: string;
    label: string;
    /** Short blurb shown on hover of the "?" help icon. */
    description?: string;
    /** App-root path or absolute URL to the plugin's icon. */
    icon?: string;
};

type NodePluginSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    options: NodePluginSelectOption[];
    /** Card label; defaults to the plugin implementation title. */
    title?: string;
    /** Dropdown open/close notification (e.g. to refresh a live list). */
    onOpenChange?: (open: boolean) => void;
};

/** Monogram fallback shown when a plugin has no icon (or it fails to load). */
function PluginMonogram({ label }: { label: string }) {
    const letter = label.trim().charAt(0).toUpperCase() || "?";
    return (
        <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-medium text-muted-foreground"
            style={{ width: 16, height: 16 }}
        >
            {letter}
        </span>
    );
}

/** Plugin icon with a graceful monogram fallback on missing/broken src. */
function PluginIcon({ icon, label }: { icon?: string; label: string }) {
    const [failed, setFailed] = useState(false);
    if (!icon || failed) return <PluginMonogram label={label} />;
    // Explicit width/height attributes: SVG icons have no intrinsic size,
    // so they must never rely on CSS alone to stay small.
    return (
        <img
            src={icon}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 shrink-0 rounded-sm object-contain"
            onError={() => setFailed(true)}
        />
    );
}

/**
 * Shared plugin implementation selector (`plugins/<id>` directory name from registry).
 */
export function NodePluginSelect({
    value,
    onValueChange,
    options,
    title,
    onOpenChange,
}: NodePluginSelectProps) {
    const t = useTranslations("Workspace.nodes.base");
    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                    {title ?? t("pluginImplementationTitle")}
                </Label>
                <Select
                    value={value}
                    onValueChange={onValueChange}
                    onOpenChange={onOpenChange}
                >
                    <SelectTrigger className="w-full" size="sm">
                        <SelectValue
                            placeholder={t("pluginSelectPlaceholder")}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem
                                key={opt.value}
                                value={opt.value}
                                endSlot={
                                    opt.description ? (
                                        <Tooltip>
                                            <TooltipTrigger
                                                asChild
                                                // Keep clicking the "?" from
                                                // selecting the row.
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                                onPointerDown={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <span className="ml-auto flex items-center text-muted-foreground/70 hover:text-muted-foreground">
                                                    <HelpCircle className="size-3.5" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="right"
                                                className="text-xs"
                                                style={{ maxWidth: 256 }}
                                            >
                                                {opt.description}
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : undefined
                                }
                            >
                                <PluginIcon icon={opt.icon} label={opt.label} />
                                <span className="truncate">{opt.label}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </Card>
    );
}
