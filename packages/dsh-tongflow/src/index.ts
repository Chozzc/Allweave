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
import { installActivation } from "./activation.ts";
import { StudioApi } from "./api.ts";
import { Config } from "./config.ts";
import { registerRoutes } from "./http/routes.ts";
import { Studio } from "./studio.ts";

export const name = "dsh-tongflow";

/** The tool registry and agent registry are the hard requirements; other seams attach when they mount. */
export const inject = ["tools", "agents"];

export { Config };
export type { Config as TongflowConfig } from "./config.ts";

export function apply(ctx: Context, config: Config): void {
    const log = (line: string) => ctx.logger?.info?.(line);
    const studio = new Studio({ config, log });
    const api = new StudioApi(studio);
    void studio.init().catch((error: unknown) => {
        ctx.logger?.warn?.(
            `dsh-tongflow: studio init failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    });

    // Tools / prompt / skills attach per agent, only for studio sessions
    // (first message starts with "@tongflow", or the cwd is a studio project).
    installActivation(ctx, {
        studio,
        env: { studio, api },
        systemSection: SYSTEM_SECTION,
    });

    ctx.inject(["webServer"], (webCtx) =>
        registerRoutes(webCtx, { studio, api, prefix: config.httpPrefix }),
    );
}

const SYSTEM_SECTION = `## TongFlow studio
A film-crew style media studio is available through the tongflow_* tools. Rules: (1) all image / audio / video generation happens by creating and running a saved workflow file — one file per generated asset, named after its target (CHR_MEI_REF, EP01_SC001_SH0010_KF …): tongflow_workflow_new → _patch → _run — there is no direct generate tool; (2) the project folder is the source of truth (bible entities CHR_/LOC_/PRP_/STY_, breakdown EP01_SC003_SH0010, takes T01…, tf:// references); (3) review generated media with tongflow_look / tongflow_perceive before circling a take. Load the "tongflow-studio" skill for the full method (and the template skill, e.g. "tongflow-manga-drama").
What the user sees (say this, never invent panels): the Studio panel next to the chat shows a project selector, a tree — 故事·剧本 (story/), 角色与设定 (world/: each entity with REF · VO folders), 分集与镜头 (episodes → scenes → shots with SB/KF/ANI/DLG), 工作流 (workflows/), 素材箱, 审片笔记, 成片输出 — and a preview area. To point at a result say e.g. "在片场面板:角色与设定 → CHR_MEI → REF,点 take 可放大/圈选" (the panel follows the project you work in). Never give absolute file paths as the way to view something.
Language: always answer in the language the user writes in (中文 → 中文, 日本語 → 日本語, …), and write project text files (script, cards, notes) in that language unless asked otherwise. Ids, tf:// references, file names and prompts sent to image/video models stay as the skill specifies (prompts in English unless the plugin needs otherwise).`;
