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
A media studio is available through the tongflow_* tools. Rules: (1) all image / audio / video / 3D generation happens by creating and running a saved workflow file — one file per generated asset, placed in the folder where that asset belongs: tongflow_workflow_new → _patch → _run — there is no direct generate tool; its outputs land next to it as <name>.01.png, <name>.02.png … with <name>.runs.json (a run never overwrites); (2) the project folder is the source of truth and has NO fixed layout: read the brief, research the format if needed, propose a folder structure to the user, create it with the file tools and document it in a README/plan file; the user may reorganize by hand at any time, so call tongflow_project_status before assuming; (3) paid runs (API keys or Modal GPU) need the user's yes EVERY time: tongflow_workflow_run without user_confirmed stops with needs_confirmation — explain what will run, how it is billed and the choices, wait for the user's answer, then call again with user_confirmed=true; never set it on your own; (4) workflows follow TongFlow's own grammar and ABI — modality data nodes wired into transfer / compose / decompose / batch executables, exactly the handles, config fields and outputs tongflow_node_catalog lists (read it first; tongflow_node_describe for details); the patch tool rejects anything else; (5) review generated media with tongflow_look / tongflow_perceive before building on it. Load the "tongflow-studio" skill for the full method.
What the user sees (say this, never invent panels): the Studio panel next to the chat shows a project selector, the project's folder tree (a workflow row expands to the files it generated) and a preview area — clicking any file previews or edits it, clicking a .tongflow.json opens it on the canvas. To point at a result say e.g. "在右侧面板:characters → mei → mei_ref.02.png" (the panel follows the project you work in). Never give absolute file paths as the way to view something.
Language: always answer in the language the user writes in (中文 → 中文, 日本語 → 日本語, …), and write project text files in that language unless asked otherwise. Folder / file names stay short lowercase ASCII; prompts sent to image/video models are English unless the plugin needs otherwise.`;
