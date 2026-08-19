"use client";

import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "tongflow/canvas";
import { openExternalUrl } from "@/lib/desktop/open-external";
import {
    resolveEnvKeyOptions,
    resolveEnvKeyType,
} from "@/lib/settings/env-key-metadata";
import type { GroupVar } from "./build-settings-sections";

/** Radix Select items can't have an empty value; sentinel for "use default". */
const USE_DEFAULT = "__use_default__";

/**
 * Localized display label for an env key: curated `Settings.keys.*` entry
 * when present, otherwise the raw key. The raw env name is always available
 * in the row tooltip.
 */
export function useEnvKeyLabel(): (key: string) => string {
    const t = useTranslations("Settings");
    return (key: string) => (t.has(`keys.${key}`) ? t(`keys.${key}`) : key);
}

export function EnvVarRow({
    v,
    value,
    revealed,
    onChange,
    onToggleReveal,
    label,
}: {
    v: GroupVar;
    value: string;
    revealed: boolean;
    onChange: (value: string) => void;
    onToggleReveal: () => void;
    /** Overrides the curated/raw label (e.g. "{provider} API Key"). */
    label?: string;
}) {
    const t = useTranslations("Settings");
    const keyLabel = useEnvKeyLabel();
    const type = resolveEnvKeyType(v.key, v);
    const options = resolveEnvKeyOptions(v.key, v);
    const displayLabel = label ?? keyLabel(v.key);
    const showGetKeyCta = type === "secret" && !value.trim() && Boolean(v.url);

    const header = (
        <div className="flex items-center gap-1.5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="text-xs font-medium">
                        {displayLabel}
                        {v.required ? (
                            <span
                                className="ml-0.5 text-red-500"
                                title={t("requiredHint")}
                            >
                                *
                            </span>
                        ) : null}
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                    <span className="font-mono">{v.key}</span>
                </TooltipContent>
            </Tooltip>
            {v.url && !showGetKeyCta ? (
                // A button, not an anchor: the desktop shell's anchor
                // interception would keep console URLs with OAuth-ish
                // paths inside the WebView (see lib/desktop).
                <button
                    type="button"
                    aria-label={t("getKey")}
                    title={v.url}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => v.url && openExternalUrl(v.url)}
                >
                    <ExternalLink className="h-3 w-3" />
                </button>
            ) : null}
            {showGetKeyCta ? (
                <button
                    type="button"
                    title={v.url}
                    className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    onClick={() => v.url && openExternalUrl(v.url)}
                >
                    {t("getApiKey")}
                    <ExternalLink className="h-3 w-3" />
                </button>
            ) : null}
        </div>
    );

    let control: React.ReactNode;
    switch (type) {
        case "select":
            control = (
                <Select
                    value={value.trim() ? value : USE_DEFAULT}
                    onValueChange={(next) =>
                        onChange(next === USE_DEFAULT ? "" : next)
                    }
                >
                    <SelectTrigger className="w-full text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={USE_DEFAULT} className="text-xs">
                            {v.default
                                ? t("useDefaultValue", { value: v.default })
                                : t("useDefault")}
                        </SelectItem>
                        {(options ?? []).map((opt) => (
                            <SelectItem
                                key={opt}
                                value={opt}
                                className="text-xs"
                            >
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
            break;
        case "boolean":
            control = (
                <div className="flex h-9 items-center">
                    <Switch
                        checked={
                            value.trim()
                                ? value === "true"
                                : v.default === "true"
                        }
                        onCheckedChange={(checked) =>
                            onChange(checked ? "true" : "false")
                        }
                    />
                </div>
            );
            break;
        case "number":
            control = (
                <Input
                    value={value}
                    placeholder={v.default ?? t("valuePlaceholder")}
                    type="number"
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 text-xs"
                    onChange={(e) => onChange(e.target.value)}
                />
            );
            break;
        case "secret":
            control = (
                <div className="flex flex-1 items-center gap-2">
                    <Input
                        value={value}
                        placeholder={v.default ?? t("valuePlaceholder")}
                        type={revealed ? "text" : "password"}
                        spellCheck={false}
                        autoComplete="off"
                        className="flex-1 font-mono text-xs"
                        onChange={(e) => onChange(e.target.value)}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground"
                        aria-label={t("toggleReveal")}
                        onClick={onToggleReveal}
                    >
                        {revealed ? (
                            <EyeOff className="h-4 w-4" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            );
            break;
        default:
            // "url" | "text": plain visible input.
            control = (
                <Input
                    value={value}
                    placeholder={v.default ?? t("valuePlaceholder")}
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 font-mono text-xs"
                    onChange={(e) => onChange(e.target.value)}
                />
            );
    }

    return (
        <div className="space-y-1">
            {header}
            {control}
            {v.description ? (
                <p className="text-xs text-muted-foreground">{v.description}</p>
            ) : null}
            {v.usedBy ? (
                <p className="text-xs text-muted-foreground/70">
                    {v.usedBy.join(", ")}
                </p>
            ) : null}
        </div>
    );
}
