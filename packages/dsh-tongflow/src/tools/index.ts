/** Register every tongflow_* tool on ctx.tools; registrations are effects (disposed on unload). */
import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { projectTools } from "./project-tools.ts";
import { runTools } from "./run-tools.ts";
import type { ToolEnv } from "./support.ts";
import { workflowTools } from "./workflow-tools.ts";

export function allTools(env: ToolEnv): ToolDefinition[] {
    return [...projectTools(env), ...workflowTools(env), ...runTools(env)];
}

export function registerTools(ctx: Context, env: ToolEnv): void {
    for (const tool of allTools(env)) {
        ctx.effect(
            () => ctx.tools.register(tool),
            `dsh-tongflow: tool ${tool.name}`,
        );
    }
}
