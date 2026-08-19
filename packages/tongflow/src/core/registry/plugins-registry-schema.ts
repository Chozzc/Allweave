import { z } from "zod";

/**
 * Plugins registry produced by the Python scanner over `plugins/*`.
 *
 * There is one kind of plugin and one way to run it: the platform spawns the
 * plugin's local entry and exchanges ABI JSON over stdin/stdout. Where the work
 * actually runs (locally, on Modal, on another cloud) is the plugin's own
 * concern — the platform binds to no backend.
 *
 * - nodePluginMap: nodeSlot -> list of `pluginId` (directory name under `plugins/`).
 *   The head of each list is that slot's **default implementation**: what a
 *   freshly added node preselects and what the plugin picker lists first. A
 *   plugin claims it with `@node_slot(..., default=True)` and the scanner
 *   hoists it; with no claim (or the claimant not installed) the head is just
 *   the first plugin in directory order.
 * - plugins[pluginId]: how to launch that plugin's entry
 */
export const PluginMethodSchema = z.object({
    methodName: z.string().min(1),
    /** Optional per-slot model ids a router-style plugin exposes
     * (`TONGFLOW_SLOT_MODELS` in the plugin source); first entry is the
     * default. Absent for single-model plugins. */
    models: z.array(z.string().min(1)).optional(),
});

export const PluginConfigSchema = z.object({
    /** Relative to repo root, e.g. `plugins/tongflow-<runner>-foo` */
    localSubdir: z.string().min(1),
    /** nodeSlot -> handler that implements it (informational; the plugin
     * dispatches in-process by nodeSlot). */
    methodsByNodeSlot: z.record(z.string().min(1), PluginMethodSchema),
    /** Generic runner executes `python <entryFile>`; every plugin ships its
     * own entry.py. */
    entryFile: z.string().min(1).optional(),
    /** True when the plugin's class is marked `@deploy` (a deploy-first backend
     * such as Modal): its entry.py deploys once before invoking. Informational —
     * the deploy step lives inside the plugin's entry.py. */
    needsDeploy: z.boolean().optional(),
    /** Presentation-only metadata merged in from `tongflow.plugin.json`'s
     * top-level `plugin` block (name/description/icon). Not produced by the
     * scanner; attached by the registry API route for the node picker. */
    name: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
});

export const PluginsRegistrySchema = z.object({
    version: z.literal(1),
    generatedAt: z.string().min(1),
    scannerVersion: z.number().int().optional(),
    nodePluginMap: z.record(z.string().min(1), z.array(z.string().min(1))),
    plugins: z.record(z.string().min(1), PluginConfigSchema),
    errors: z
        .array(
            z.object({
                pluginId: z.string().min(1),
                message: z.string().min(1),
            }),
        )
        .optional(),
});

export type PluginsRegistry = z.infer<typeof PluginsRegistrySchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
