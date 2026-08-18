/**
 * dsh-tongflow — host (Node) half.
 *
 * A Cordis plugin mounted by the dsh Loader. It stands up the Studio (paths,
 * python bootstrap, plugin registry, run manager) and registers, as effects:
 * the tongflow_* agent tools, packaged skills, a short system-prompt section
 * and the HTTP routes the embedded canvas / studio UI talk to.
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-tools";
import { StudioApi } from "./api.ts";
import { Config } from "./config.ts";
import { registerRoutes } from "./http/routes.ts";
import { registerSkills } from "./skills/provider.ts";
import { Studio } from "./studio.ts";
import { registerTools } from "./tools/index.ts";

export const name = "dsh-tongflow";

/** The tool registry is the only hard requirement; other seams attach when they mount. */
export const inject = ["tools"];

export { Config };
export type { Config as TongflowConfig } from "./config.ts";

export function apply(ctx: Context, config: Config): void {
    const log = (line: string) => ctx.logger?.info?.(line);
    const studio = new Studio({ config, log });
    const api = new StudioApi(studio);
    void studio.init().catch((error: unknown) => {
        ctx.logger?.warn?.(`dsh-tongflow: studio init failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    registerTools(ctx, { ctx, studio, api });

    ctx.inject(["systemPrompt"], (promptCtx) => {
        promptCtx.effect(
            () =>
                promptCtx.systemPrompt.section({
                    name: "tool:tongflow",
                    order: 150,
                    text: SYSTEM_SECTION,
                }),
            "dsh-tongflow: system prompt section",
        );
    });

    ctx.inject(["skills"], (skillCtx) => registerSkills(skillCtx));

    ctx.inject(["webServer"], (webCtx) => registerRoutes(webCtx, { studio, api, prefix: config.httpPrefix }));
}

const SYSTEM_SECTION = `## TongFlow studio
A film-crew style media studio is available through the tongflow_* tools. Rules: (1) all image / audio / video generation happens by creating and running a saved workflow file (tongflow_workflow_new → _patch → _bind → _run) — there is no direct generate tool; (2) the project folder is the source of truth (bible entities CHR_/LOC_/PRP_/STY_, breakdown EP01_SC003_SH0010, takes T01…, tf:// references); (3) review generated media with tongflow_look / tongflow_perceive before circling a take. Load the "tongflow-studio" skill for the full method (and the template skill, e.g. "tongflow-manga-drama").`;
