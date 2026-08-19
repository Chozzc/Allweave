import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "tongflow";
import {
    type PluginEnvDecl,
    PluginEnvManifestSchema,
} from "@/lib/plugins/plugin-env-manifest-schema";
import { pluginsDir } from "@/lib/runtime/paths.server";

export const PLUGIN_ENV_MANIFEST_FILE = "tongflow.plugin.json";

/**
 * Default plugin-env backend: reads `tongflow.plugin.json` from every
 * installed plugin (same `.git` presence check as isPluginInstalled, so
 * partial clones are skipped). Reads fresh on every call — files are tiny,
 * the settings dialog is low-frequency, and newly installed plugins are
 * picked up automatically. A missing or invalid manifest never fails the
 * call; it just yields no entry. A cloud shell substitutes a build-time
 * baked declaration list via `src/ext/plugin-env.ts`.
 */
export function loadPluginEnvDecls(): PluginEnvDecl[] {
    const root = pluginsDir();
    let entries: Dirent[];
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch {
        return [];
    }

    const decls: PluginEnvDecl[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginId = entry.name;
        const pluginRoot = join(root, pluginId);
        const manifestPath = join(pluginRoot, PLUGIN_ENV_MANIFEST_FILE);
        if (
            !existsSync(join(pluginRoot, ".git")) ||
            !existsSync(manifestPath)
        ) {
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch (error) {
            logger.warn(
                `[plugins] unreadable ${PLUGIN_ENV_MANIFEST_FILE} in ${pluginId}:`,
                error,
            );
            continue;
        }
        const result = PluginEnvManifestSchema.safeParse(parsed);
        if (!result.success) {
            logger.warn(
                `[plugins] invalid ${PLUGIN_ENV_MANIFEST_FILE} in ${pluginId}: ${result.error.message}`,
            );
            continue;
        }

        // Dedupe keys within one plugin; first declaration wins.
        const seen = new Set<string>();
        const env = result.data.env.filter((v) => {
            if (seen.has(v.key)) return false;
            seen.add(v.key);
            return true;
        });
        const meta = result.data.plugin;
        // Emit an entry when the plugin declares env vars OR presentation
        // metadata, so plugins that ship only name/description/icon still surface.
        if (env.length > 0 || meta) decls.push({ pluginId, meta, env });
    }

    decls.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
    return decls;
}
