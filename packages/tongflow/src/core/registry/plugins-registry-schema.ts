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

/**
 * Optional live model catalog (`TONGFLOW_MODEL_CATALOG` in the plugin source).
 * The canvas GETs `url` in the browser (public, CORS-enabled, no auth) — or,
 * when `authEnv` names the env key holding a bearer token, through the app's
 * `/api/plugins/model-catalog` route, which injects the stored key server-side
 * — reads the record array at dot-path `items`, each model id at dot-path `id`, drops
 * records where an `exclude` field equals its literal, and keeps a record for
 * a slot when every `slots[slot]` token is a substring of the named field
 * (arrays/objects are JSON-serialized before matching; a token prefixed with
 * `!` must be absent instead). Matching ids extend
 * that slot's dropdown after the static `models` shortlist.
 */
export const PluginModelCatalogSchema = z.object({
    url: z.string().url(),
    /** Env key whose value is sent as `Authorization: Bearer …`; the fetch is
     * proxied server-side so the key never reaches the browser. */
    authEnv: z.string().min(1).optional(),
    items: z.string().min(1).default("data"),
    id: z.string().min(1).default("id"),
    exclude: z
        .record(
            z.string().min(1),
            z.union([z.string(), z.boolean(), z.number()]),
        )
        .optional(),
    /** slot -> field -> token(s). Every token must be a substring of the
     * field's JSON; a token prefixed with `!` must be absent. */
    slots: z.record(
        z.string().min(1),
        z.record(
            z.string().min(1),
            z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        ),
    ),
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
    /** Live model catalog the canvas can fetch to extend the model dropdown. */
    modelCatalog: PluginModelCatalogSchema.optional(),
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
export type PluginModelCatalog = z.infer<typeof PluginModelCatalogSchema>;
