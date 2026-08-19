/** Plugin configuration (cordis.yml row `config`), validated by schemastery at load. */
import z from "@deepseek-ai/schemastery";
import { DEFAULT_TONGFLOW_SDK_VERSION } from "./engine/bootstrap.ts";
import { OFFICIAL_ORG } from "./engine/registry.ts";

export interface Config {
    /** Studio data root; default `<DSH_HOME>/tongflow` (projects, venv, plugins, data). */
    studioRoot?: string;
    /** Python ≥ 3.10 used to create the studio venv; auto-detected when empty. */
    pythonPath?: string;
    /** pip requirement installed into the studio venv (e.g. `tongflow==0.3.0` or `-e /path/to/sdk`). */
    sdkSpec: string;
    /** Git organisation official plugins are cloned from. */
    pluginOrg: string;
    /** Plugin id → git URL overrides (community / private plugins). */
    pluginGitUrls: Record<string, string>;
    /** Environment passed to every plugin process (API keys, Modal tokens). Prefer credentials over literal values. */
    env: Record<string, string>;
    /** Upper bound on simultaneously running workflows. */
    maxConcurrentRuns: number;
    /** URL prefix the plugin's HTTP routes mount under. */
    httpPrefix: string;
    /** UI locale for the embedded canvas (en / zh / ja / ko). */
    locale: string;
    /** Clone every official plugin at start so the canvas offers the full catalog (shallow clones; keys / deploys only at run time). */
    autoInstallOfficial: boolean;
}

export const Config: z<Config> = z.object({
    studioRoot: z.string(),
    pythonPath: z.string(),
    sdkSpec: z.string().default(`tongflow==${DEFAULT_TONGFLOW_SDK_VERSION}`),
    pluginOrg: z.string().default(OFFICIAL_ORG),
    pluginGitUrls: z.dict(z.string()).default({}),
    env: z.dict(z.string()).default({}),
    maxConcurrentRuns: z.number().default(2),
    httpPrefix: z.string().default("/tongflow"),
    locale: z.string().default("en"),
    autoInstallOfficial: z.boolean().default(true),
});
