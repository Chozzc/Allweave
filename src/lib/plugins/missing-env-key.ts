import type { PluginEnvDecl } from "./plugin-env-manifest-schema";

/**
 * Pre-dispatch check: the first required env key of `pluginId` that has no
 * value. Lets the platform fail fast with a coded `missing_api_key` error
 * (and the provider console `url` for the guidance dialog) instead of
 * spinning up the plugin just to have it die on a missing key.
 *
 * Keys with a declared `default` are never reported — the plugin runs
 * without them.
 */
export function findMissingRequiredKey(
    decls: PluginEnvDecl[],
    pluginId: string | null | undefined,
    hasValue: (key: string) => boolean,
): { key: string; url?: string } | null {
    if (!pluginId) return null;
    const decl = decls.find((d) => d.pluginId === pluginId);
    if (!decl) return null;
    for (const v of decl.env) {
        if (!v.required || v.default !== undefined) continue;
        if (!hasValue(v.key)) return { key: v.key, url: v.url };
    }
    return null;
}
