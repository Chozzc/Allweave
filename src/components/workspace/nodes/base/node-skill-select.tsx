"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveSkill, useSkillsRegistry } from "@/hooks/use-skills";
import type { SkillDefinition, SkillRef } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

/**
 * Skill picker for prompt-driven nodes: lists every skill from installed
 * `tongflow-package-*` content packages, grouped by category. Selection is a
 * plain value/onChange pair — the node persists the `SkillRef` on its data.
 */

const CATEGORY_KEYS: Record<string, string> = {
    text: "text",
    "image-prompt": "imagePrompt",
    "video-prompt": "videoPrompt",
};

interface SkillGroup {
    labelKey: string;
    items: { packageId: string; skill: SkillDefinition }[];
}

interface NodeSkillSelectProps {
    value?: SkillRef;
    onChange: (ref: SkillRef | null) => void;
}

export function NodeSkillSelect({ value, onChange }: NodeSkillSelectProps) {
    const t = useTranslations("Workspace.skills");
    const { registry, isLoaded } = useSkillsRegistry();

    const selectedSkill = resolveSkill(registry, value);
    const isMissing = Boolean(value && isLoaded && !selectedSkill);

    const groups: SkillGroup[] = useMemo(() => {
        const byKey = new Map<string, SkillGroup["items"]>();
        for (const pkg of Object.values(registry?.packages ?? {})) {
            for (const skill of pkg.skills) {
                const key = CATEGORY_KEYS[skill.category ?? ""] ?? "other";
                const list = byKey.get(key) ?? [];
                list.push({ packageId: pkg.id, skill });
                byKey.set(key, list);
            }
        }
        return ["text", "imagePrompt", "videoPrompt", "other"]
            .filter((key) => byKey.has(key))
            .map((key) => ({ labelKey: key, items: byKey.get(key) ?? [] }));
    }, [registry]);

    return (
        <div className="nodrag flex items-center gap-1">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    {value ? (
                        <Button
                            size="sm"
                            variant="secondary"
                            className={cn(
                                "h-7 max-w-60 gap-1.5 px-2 text-xs",
                                isMissing &&
                                    "text-muted-foreground line-through",
                            )}
                            title={isMissing ? t("missing") : value.name}
                        >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{value.name}</span>
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            {t("select")}
                        </Button>
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="nodrag max-h-80 w-64 overflow-y-auto"
                >
                    {groups.length === 0 && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                            {t("empty")}
                        </div>
                    )}
                    {groups.map((group, gi) => (
                        <div key={group.labelKey}>
                            {gi > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuLabel className="text-xs text-muted-foreground">
                                {t(`categories.${group.labelKey}`)}
                            </DropdownMenuLabel>
                            {group.items.map(({ packageId, skill }) => {
                                const isSelected =
                                    value?.package === packageId &&
                                    value?.id === skill.id;
                                return (
                                    <DropdownMenuItem
                                        key={`${packageId}/${skill.id}`}
                                        onSelect={() =>
                                            onChange({
                                                package: packageId,
                                                id: skill.id,
                                                name: skill.name,
                                            })
                                        }
                                    >
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm">
                                                {skill.name}
                                            </span>
                                            {skill.description && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {skill.description}
                                                </span>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <Check className="ml-2 h-4 w-4 shrink-0" />
                                        )}
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            {value && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    onClick={() => onChange(null)}
                    title={t("clear")}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}
