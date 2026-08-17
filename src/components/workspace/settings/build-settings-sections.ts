import { pluginDisplayName } from "tongflow/canvas";
import type {
    PluginEnvDecl,
    PluginEnvVar,
} from "@/lib/plugins/plugin-env-manifest-schema";
import { resolveEnvKeySection } from "@/lib/settings/env-key-metadata";

/** A declared var as rendered inside a card; shared vars carry `usedBy`. */
export interface GroupVar extends PluginEnvVar {
    /** Display names of the plugins declaring this key (shared keys only). */
    usedBy?: string[];
}

/** A plugin with at least one required key: one entry in the Providers list. */
export interface ProviderGroup {
    pluginId: string;
    title: string;
    requiredVars: GroupVar[];
    optionalVars: GroupVar[];
}

/** A plugin with only optional knobs: a plain card in the Advanced section. */
export interface AdvancedPluginGroup {
    pluginId: string;
    title: string;
    vars: GroupVar[];
}

export interface SettingsSections {
    /** Keys pinned to the Modal connect card (token id/secret). */
    modalVars: GroupVar[];
    /** Other compute credentials shown flat in the Compute section (HF token). */
    computeVars: GroupVar[];
    /** Plugins needing an API key: required keys flat, knobs collapsible. */
    providers: ProviderGroup[];
    /** Everything else, behind the Advanced disclosure. */
    advancedSharedVars: GroupVar[];
    advancedPluginGroups: AdvancedPluginGroup[];
}

/**
 * Splits plugin env declarations into the three-tier settings layout:
 * Compute (Modal + shared credentials), Providers (per-plugin API keys),
 * Advanced (shared knobs, knob-only plugins).
 *
 * Shared-key merge rule (unchanged from the legacy card grouping): a key
 * declared by >=2 plugins is rendered once — required if any declarer says
 * so, description/default kept only when every declarer agrees, url from the
 * first declarer, `usedBy` listing all declarers.
 */
export function buildSettingsSections(
    decls: PluginEnvDecl[],
): SettingsSections {
    const usage = new Map<string, { v: GroupVar; plugins: string[] }>();
    for (const decl of decls) {
        for (const v of decl.env) {
            const seen = usage.get(v.key);
            if (seen) {
                seen.plugins.push(decl.pluginId);
                if (v.required) seen.v = { ...seen.v, required: true };
                if (seen.v.description !== v.description) {
                    seen.v = { ...seen.v, description: undefined };
                }
                if (seen.v.default !== v.default) {
                    seen.v = { ...seen.v, default: undefined };
                }
            } else {
                usage.set(v.key, { v: { ...v }, plugins: [decl.pluginId] });
            }
        }
    }

    const modalVars: GroupVar[] = [];
    const computeVars: GroupVar[] = [];
    const advancedSharedVars: GroupVar[] = [];
    const pinnedOrShared = new Set<string>();
    for (const { v, plugins } of usage.values()) {
        const section = resolveEnvKeySection(v.key);
        const shared = plugins.length >= 2;
        if (!section && !shared) continue;
        pinnedOrShared.add(v.key);
        const gv: GroupVar = shared
            ? { ...v, usedBy: plugins.map(pluginDisplayName) }
            : { ...v };
        if (section === "modal") modalVars.push(gv);
        else if (section === "compute") computeVars.push(gv);
        else advancedSharedVars.push(gv);
    }

    const providers: ProviderGroup[] = [];
    const advancedPluginGroups: AdvancedPluginGroup[] = [];
    for (const decl of decls) {
        const vars = decl.env.filter((v) => !pinnedOrShared.has(v.key));
        if (vars.length === 0) continue;
        const title = pluginDisplayName(decl.pluginId);
        const requiredVars = vars.filter((v) => v.required);
        const optionalVars = vars.filter((v) => !v.required);
        if (requiredVars.length > 0) {
            providers.push({
                pluginId: decl.pluginId,
                title,
                requiredVars,
                optionalVars,
            });
        } else {
            advancedPluginGroups.push({
                pluginId: decl.pluginId,
                title,
                vars: optionalVars,
            });
        }
    }

    return {
        modalVars,
        computeVars,
        providers,
        advancedSharedVars,
        advancedPluginGroups,
    };
}
