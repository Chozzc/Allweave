/** Shared helpers for the tongflow_* tools: project resolution, rendering, schemas. */
import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { JsonValue } from "@deepseek-ai/dsh-session";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { StudioApi } from "../api.ts";
import { isProjectId } from "../project/naming.ts";
import { isInsideProject } from "../project/paths.ts";
import type { Studio } from "../studio.ts";

export interface ToolEnv {
    ctx: Context;
    studio: Studio;
    api: StudioApi;
}

/**
 * Which project a call refers to: explicit `project` argument, else the
 * session's cwd when it lives under the studio projects dir, else the only
 * project, else an error listing the choices.
 */
export async function resolveProjectId(
    env: ToolEnv,
    exec: ToolRunContext,
    explicit?: string,
): Promise<string> {
    if (explicit?.trim()) {
        const id = explicit.trim();
        if (!isProjectId(id)) throw new Error(`invalid project id "${id}"`);
        await env.api.project(id);
        return id;
    }
    const cwd = exec.agent?.session.header.cwd;
    if (cwd && isInsideProject(env.studio.paths.projects, cwd)) {
        const rel = cwd
            .slice(env.studio.paths.projects.length)
            .replace(/^[/\\]/, "");
        const id = rel.split(/[/\\]/)[0];
        if (id && isProjectId(id)) {
            try {
                await env.api.project(id);
                return id;
            } catch {
                // fall through
            }
        }
    }
    const projects = await env.api.listProjects();
    if (projects.length === 1) return projects[0].id;
    if (projects.length === 0) {
        throw new Error(
            "no studio project yet — create one with tongflow_project_create({ title, template })",
        );
    }
    throw new Error(
        `several projects exist; pass project: one of ${projects.map((p) => p.id).join(", ")} (or open one so the session cwd is its folder)`,
    );
}

export function text(value: unknown): ContentBlock[] {
    return [
        {
            type: "text",
            text:
                typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2),
        },
    ];
}

/** Trim big JSON so a tool result stays readable for the model, and brand it as a JsonValue. */
export function compact(value: unknown): JsonValue {
    return JSON.parse(
        JSON.stringify(value, (_k, v) => {
            if (typeof v === "string" && v.length > 4000)
                return `${v.slice(0, 4000)}… (${v.length} chars)`;
            return v;
        }) ?? "null",
    ) as JsonValue;
}

export const PROJECT_PARAM = {
    type: "string",
    description:
        "Project id. Optional when the session is opened inside a project folder or only one project exists.",
} as const;

export const OWNER_DESC =
    "Owner id: an entity (CHR_MEI / LOC_ROOFTOP / PRP_… / STY_MAIN), a shot (EP01_SC003_SH0010) or an episode (EP01).";
export const PASS_DESC =
    "Pass code. Entity: REF (reference image) · VO (voice reference). Shot: SB (storyboard) · KF (keyframe) · ANI (animation) · DLG (dialogue audio). Episode: MUS · SFX · MIX · CUT.";

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
