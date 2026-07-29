"use client";

import {
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    Loader2,
    Plus,
    Settings,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    HF_TOKEN_ENV,
    MODAL_TOKEN_ID_ENV,
    resolveEnvKeyType,
} from "@/lib/settings/env-key-metadata";
import {
    buildSettingsSections,
    type GroupVar,
    type ProviderGroup,
} from "./build-settings-sections";
import {
    HF_CONNECT,
    MODAL_CONNECT,
    providerConnectConfig,
} from "./connect-configs";
import { EnvVarRow } from "./env-var-row";
import {
    isTokenConnected,
    TokenConnectCard,
    TokenConnectCardBody,
    TokenConnectedBadge,
} from "./token-connect";
import { useEnvSettings } from "./use-env-settings";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

function CollapsibleToggle({
    open,
    onToggle,
    label,
}: {
    open: boolean;
    onToggle: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onToggle}
        >
            {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
            ) : (
                <ChevronRight className="h-3.5 w-3.5" />
            )}
            {label}
        </button>
    );
}

function ProviderCard({
    group,
    values,
    revealed,
    onChangeValue,
    onToggleReveal,
    onEnvChanged,
}: {
    group: ProviderGroup;
    values: Record<string, string>;
    revealed: Record<string, boolean>;
    onChangeValue: (key: string, value: string) => void;
    onToggleReveal: (key: string) => void;
    /** Called after a connect/disconnect PATCH so the dialog refetches. */
    onEnvChanged: () => void;
}) {
    const t = useTranslations("Settings");
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const setCount = group.requiredVars.filter((v) =>
        (values[v.key] ?? "").trim(),
    ).length;
    const allSet = setCount === group.requiredVars.length;
    // The guided connect flow needs an unambiguous mapping: a single
    // required secret. Anything else falls back to plain rows.
    const soleSecret =
        group.requiredVars.length === 1 &&
        resolveEnvKeyType(group.requiredVars[0].key, group.requiredVars[0]) ===
            "secret";
    const connectConfig = soleSecret
        ? providerConnectConfig(
              group.title,
              group.requiredVars[0].key,
              group.requiredVars[0].url,
          )
        : null;

    return (
        <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{group.title}</span>
                {connectConfig ? (
                    isTokenConnected(connectConfig, values) ? (
                        <TokenConnectedBadge config={connectConfig} />
                    ) : null
                ) : (
                    <Badge variant={allSet ? "secondary" : "outline"}>
                        {t("setBadge", {
                            set: setCount,
                            total: group.requiredVars.length,
                        })}
                    </Badge>
                )}
            </div>

            {connectConfig ? (
                <TokenConnectCardBody
                    config={connectConfig}
                    values={values}
                    onChanged={onEnvChanged}
                />
            ) : (
                group.requiredVars.map((v) => (
                    <EnvVarRow
                        key={v.key}
                        v={v}
                        value={values[v.key] ?? ""}
                        revealed={Boolean(revealed[v.key])}
                        onChange={(value) => onChangeValue(v.key, value)}
                        onToggleReveal={() => onToggleReveal(v.key)}
                    />
                ))
            )}

            {group.optionalVars.length > 0 ? (
                <>
                    <CollapsibleToggle
                        open={advancedOpen}
                        onToggle={() => setAdvancedOpen((open) => !open)}
                        label={t("advanced", {
                            count: group.optionalVars.length,
                        })}
                    />
                    {advancedOpen
                        ? group.optionalVars.map((v) => (
                              <EnvVarRow
                                  key={v.key}
                                  v={v}
                                  value={values[v.key] ?? ""}
                                  revealed={Boolean(revealed[v.key])}
                                  onChange={(value) =>
                                      onChangeValue(v.key, value)
                                  }
                                  onToggleReveal={() => onToggleReveal(v.key)}
                              />
                          ))
                        : null}
                </>
            ) : null}
        </div>
    );
}

function VarListCard({
    title,
    vars,
    values,
    revealed,
    onChangeValue,
    onToggleReveal,
}: {
    title?: string;
    vars: GroupVar[];
    values: Record<string, string>;
    revealed: Record<string, boolean>;
    onChangeValue: (key: string, value: string) => void;
    onToggleReveal: (key: string) => void;
}) {
    return (
        <div className="space-y-2 rounded-lg border p-3">
            {title ? (
                <span className="text-sm font-medium">{title}</span>
            ) : null}
            {vars.map((v) => (
                <EnvVarRow
                    key={v.key}
                    v={v}
                    value={values[v.key] ?? ""}
                    revealed={Boolean(revealed[v.key])}
                    onChange={(value) => onChangeValue(v.key, value)}
                    onToggleReveal={() => onToggleReveal(v.key)}
                />
            ))}
        </div>
    );
}

export function SettingsDialog() {
    const t = useTranslations("Settings");
    const [open, setOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const {
        loading,
        saving,
        decls,
        values,
        customRows,
        revealed,
        fetchEnv,
        setValue,
        toggleReveal,
        updateCustomRow,
        addCustomRow,
        removeCustomRow,
        save,
    } = useEnvSettings();

    const sections = useMemo(() => buildSettingsSections(decls), [decls]);

    useEffect(() => {
        if (open) void fetchEnv();
    }, [open, fetchEnv]);

    const advancedCount =
        sections.advancedSharedVars.length +
        sections.advancedPluginGroups.reduce((n, g) => n + g.vars.length, 0);
    const showCompute =
        sections.modalVars.length > 0 || sections.computeVars.length > 0;
    const hasModal = sections.modalVars.some(
        (v) => v.key === MODAL_TOKEN_ID_ENV,
    );
    const hasHf = sections.computeVars.some((v) => v.key === HF_TOKEN_ENV);
    // HF renders as a connect card; other compute credentials stay plain rows.
    const plainComputeVars = sections.computeVars.filter(
        (v) => v.key !== HF_TOKEN_ENV,
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={navBtnClass}
                            aria-label={t("title")}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("title")}</TooltipContent>
            </Tooltip>

            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
                        {showCompute ? (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t("computeSectionTitle")}
                                </h3>
                                {hasModal ? (
                                    <TokenConnectCard
                                        config={MODAL_CONNECT}
                                        values={values}
                                        onChanged={() => void fetchEnv()}
                                    />
                                ) : null}
                                {hasHf ? (
                                    <TokenConnectCard
                                        config={HF_CONNECT}
                                        values={values}
                                        onChanged={() => void fetchEnv()}
                                    />
                                ) : null}
                                {plainComputeVars.length > 0 ? (
                                    <VarListCard
                                        vars={plainComputeVars}
                                        values={values}
                                        revealed={revealed}
                                        onChangeValue={setValue}
                                        onToggleReveal={toggleReveal}
                                    />
                                ) : null}
                            </div>
                        ) : null}

                        {sections.providers.length > 0 ? (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t("providersSectionTitle")}
                                </h3>
                                {sections.providers.map((group) => (
                                    <ProviderCard
                                        key={group.pluginId}
                                        group={group}
                                        values={values}
                                        revealed={revealed}
                                        onChangeValue={setValue}
                                        onToggleReveal={toggleReveal}
                                        onEnvChanged={() => void fetchEnv()}
                                    />
                                ))}
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <CollapsibleToggle
                                open={advancedOpen}
                                onToggle={() =>
                                    setAdvancedOpen((open) => !open)
                                }
                                label={t("advancedSection", {
                                    count: advancedCount,
                                })}
                            />
                            {advancedOpen ? (
                                <>
                                    {sections.advancedSharedVars.length > 0 ? (
                                        <VarListCard
                                            title={t("sharedSectionTitle")}
                                            vars={sections.advancedSharedVars}
                                            values={values}
                                            revealed={revealed}
                                            onChangeValue={setValue}
                                            onToggleReveal={toggleReveal}
                                        />
                                    ) : null}
                                    {sections.advancedPluginGroups.map(
                                        (group) => (
                                            <VarListCard
                                                key={group.pluginId}
                                                title={group.title}
                                                vars={group.vars}
                                                values={values}
                                                revealed={revealed}
                                                onChangeValue={setValue}
                                                onToggleReveal={toggleReveal}
                                            />
                                        ),
                                    )}

                                    <div className="space-y-2">
                                        <div>
                                            <h3 className="text-sm font-medium">
                                                {t("customSectionTitle")}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                {t("customSectionHint")}
                                            </p>
                                        </div>
                                        {customRows.map((row, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-2"
                                            >
                                                <Input
                                                    value={row.key}
                                                    placeholder={t(
                                                        "keyPlaceholder",
                                                    )}
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                    className="flex-1 font-mono text-xs"
                                                    onChange={(e) =>
                                                        updateCustomRow(index, {
                                                            key: e.target.value,
                                                        })
                                                    }
                                                />
                                                <Input
                                                    value={row.value}
                                                    placeholder={t(
                                                        "valuePlaceholder",
                                                    )}
                                                    type={
                                                        revealed[
                                                            `custom:${index}`
                                                        ]
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                    className="flex-1 font-mono text-xs"
                                                    onChange={(e) =>
                                                        updateCustomRow(index, {
                                                            value: e.target
                                                                .value,
                                                        })
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 shrink-0 text-muted-foreground"
                                                    aria-label={t(
                                                        "toggleReveal",
                                                    )}
                                                    onClick={() =>
                                                        toggleReveal(
                                                            `custom:${index}`,
                                                        )
                                                    }
                                                >
                                                    {revealed[
                                                        `custom:${index}`
                                                    ] ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
                                                    aria-label={t("removeRow")}
                                                    onClick={() =>
                                                        removeCustomRow(index)
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={addCustomRow}
                                        >
                                            <Plus className="mr-1 h-4 w-4" />
                                            {t("addRow")}
                                        </Button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        disabled={saving || loading}
                        onClick={save}
                    >
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {t("save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
