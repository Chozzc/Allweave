/** Project, bible, breakdown and take tools. */
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { EpisodeBreakdown, Pass } from "../shared/types.ts";
import {
    compact,
    OWNER_DESC,
    PASS_DESC,
    PROJECT_PARAM,
    resolveProjectId,
    type ToolEnv,
    text,
} from "./support.ts";

export function projectTools(env: ToolEnv): ToolDefinition[] {
    const { api } = env;
    return [
        defineTool({
            name: "tongflow_project_create",
            description:
                "Create a new studio project from a template (folder scaffold + workflow templates). Returns the project id and root. " +
                "Ask the user to open the project (or call tongflow_project_open) so the session's working directory is the project folder.",
            parameters: {
                title: {
                    type: "string",
                    required: true,
                    description: "Human title of the production.",
                },
                template: {
                    type: "string",
                    required: true,
                    description:
                        "Template id, e.g. 'manga-drama' (see tongflow_project_list for available templates).",
                },
                logline: {
                    type: "string",
                    description: "One-sentence premise.",
                },
                id: {
                    type: "string",
                    description:
                        "Preferred kebab-case project id (derived from the title when omitted).",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args) {
                const summary = await api.createProject({
                    title: args.title,
                    template: args.template,
                    ...(args.logline ? { logline: args.logline } : {}),
                    ...(args.id ? { id: args.id } : {}),
                });
                return compact({
                    ok: true,
                    project: summary.id,
                    root: summary.root,
                    template: summary.template,
                    hint: "Open the project in the Studio tab (or start a session in that folder) so file tools work relative to it.",
                });
            },
        }),
        defineTool({
            name: "tongflow_project_list",
            description:
                "List studio projects and the available project templates.",
            parameters: {},
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute() {
                const [projects, templates] = await Promise.all([
                    api.listProjects(),
                    api.listTemplates(),
                ]);
                return compact({
                    projects: projects.map((p) => ({
                        id: p.id,
                        title: p.title,
                        template: p.template,
                        root: p.root,
                        entities: p.entityCount,
                        shots: p.shotCount,
                        workflows: p.workflowCount,
                        updatedAt: p.updatedAt,
                    })),
                    templates: templates.map((t) => ({
                        id: t.id,
                        title: t.title,
                        description: t.description,
                    })),
                });
            },
        }),
        defineTool({
            name: "tongflow_project_status",
            description:
                "The crew board for a project: bible entities (with circled REF/VO takes), episodes → scenes → shots with per-pass take counts and circled takes, workflows, recent runs. Call this first to see what exists and what is missing.",
            parameters: { project: PROJECT_PARAM },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const id = await resolveProjectId(env, exec, args.project);
                return compact(await api.status(id));
            },
        }),
        defineTool({
            name: "tongflow_bible_list",
            description:
                "List bible entities (characters CHR_, locations LOC_, props PRP_, style STY_) with their circled reference takes.",
            parameters: { project: PROJECT_PARAM },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const id = await resolveProjectId(env, exec, args.project);
                return compact(await api.listEntities(id));
            },
        }),
        defineTool({
            name: "tongflow_bible_get",
            description:
                "Read one bible entity: card.md, consistency kit (seed, prompt prefix/suffix, negative prompt, reference images, voice ref) and take overview.",
            parameters: {
                project: PROJECT_PARAM,
                id: {
                    type: "string",
                    required: true,
                    description:
                        "Entity id, e.g. CHR_MEI, LOC_ROOFTOP, STY_MAIN.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const e = await api.getEntity(pid, args.id);
                if (!e)
                    return {
                        ok: false,
                        error: `entity ${args.id} does not exist`,
                    };
                return compact(e);
            },
        }),
        defineTool({
            name: "tongflow_bible_upsert",
            description:
                "Create or update a bible entity. `card` is the full markdown (name as `# Heading`, then description, personality, look, wardrobe, voice…). " +
                "`consistency` is merged into the entity's consistency kit — the values every workflow that renders this entity must reuse (promptPrefix, negativePrompt, seed, pluginId, model). " +
                "Reference images / voice refs are NOT set here: generate them into REF / VO takes with a workflow.",
            parameters: {
                project: PROJECT_PARAM,
                id: {
                    type: "string",
                    required: true,
                    description:
                        "Entity id: CHR_/LOC_/PRP_/STY_ + UPPER_SNAKE, e.g. CHR_MEI.",
                },
                card: {
                    type: "string",
                    description: "Full markdown replacement for card.md.",
                },
                consistency: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Partial consistency kit: promptPrefix, promptSuffix, negativePrompt, seed, pluginId, model, lora, notes. Use null to delete a key.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(
                    await api.upsertEntity(pid, {
                        id: args.id,
                        ...(args.card !== undefined ? { card: args.card } : {}),
                        ...(args.consistency
                            ? {
                                  consistency: args.consistency as Record<
                                      string,
                                      unknown
                                  >,
                              }
                            : {}),
                    }),
                );
            },
        }),
        defineTool({
            name: "tongflow_breakdown_get",
            description:
                "Read an episode's shot breakdown (scenes → shots with size, camera, duration, characters, props, action, dialogue lines, prompts) plus per-shot take status.",
            parameters: {
                project: PROJECT_PARAM,
                episode: {
                    type: "string",
                    required: true,
                    description: "Episode id, e.g. EP01.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const bd = await api.getBreakdown(pid, args.episode);
                if (!bd)
                    return {
                        ok: false,
                        error: `no breakdown for ${args.episode} yet — write one with tongflow_breakdown_set`,
                    };
                return compact({
                    breakdown: bd,
                    status: await api.shotStatuses(pid, args.episode),
                });
            },
        }),
        defineTool({
            name: "tongflow_breakdown_set",
            description:
                "Write (replace) an episode's shot breakdown. Scenes and shots may omit ids: scenes are numbered SC001…, shots SH0010, SH0020… (step 10 so shots can be inserted). " +
                "Reference entities by id (CHR_MEI, LOC_ROOFTOP). Put the exact text each pass should render from in `prompts` (SB / KF / ANI) and the spoken lines in `dialogue`. " +
                "Shot directories (SB/KF/ANI/DLG) are created immediately.",
            parameters: {
                project: PROJECT_PARAM,
                breakdown: {
                    type: "object",
                    additionalProperties: true,
                    required: true,
                    description:
                        "{ episode:'EP01', title?, synopsis?, scenes:[{ id?, title?, location?, timeOfDay?, summary?, characters?:[ids], shots:[{ id?, size?, camera?, duration?, characters?, props?, action?, dialogue?:[{character, line, direction?}], prompts?:{SB?,KF?,ANI?}, notes? }] }] }",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const bd = await api.setBreakdown(
                    pid,
                    args.breakdown as unknown as EpisodeBreakdown,
                );
                return compact({
                    ok: true,
                    episode: bd.episode,
                    scenes: bd.scenes.map((s) => ({
                        id: s.id,
                        shots: s.shots.map((h) => h.id),
                    })),
                });
            },
        }),
        defineTool({
            name: "tongflow_take_list",
            description:
                "List the takes of an owner (all passes, or one pass): take ids, files, sizes, which is circled, and provenance (workflow, bindings, plugins).",
            parameters: {
                project: PROJECT_PARAM,
                owner: {
                    type: "string",
                    required: true,
                    description: OWNER_DESC,
                },
                pass: { type: "string", description: PASS_DESC },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                if (args.pass)
                    return compact(
                        await api.listTakes(pid, args.owner, args.pass as Pass),
                    );
                return compact(await api.allTakes(pid, args.owner));
            },
        }),
        defineTool({
            name: "tongflow_take_circle",
            description:
                "Circle a take: make it the version `tf://<owner>/<PASS>` resolves to (what downstream workflows and the cut use).",
            parameters: {
                project: PROJECT_PARAM,
                owner: {
                    type: "string",
                    required: true,
                    description: OWNER_DESC,
                },
                pass: {
                    type: "string",
                    required: true,
                    description: PASS_DESC,
                },
                take: {
                    type: "string",
                    required: true,
                    description: "Take id, e.g. T02.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(
                    await api.circleTake(
                        pid,
                        args.owner,
                        args.pass as Pass,
                        args.take,
                    ),
                );
            },
        }),
        defineTool({
            name: "tongflow_take_delete",
            description:
                "Delete a take (file + provenance). If it was circled, the latest remaining take becomes circled.",
            parameters: {
                project: PROJECT_PARAM,
                owner: {
                    type: "string",
                    required: true,
                    description: OWNER_DESC,
                },
                pass: {
                    type: "string",
                    required: true,
                    description: PASS_DESC,
                },
                take: {
                    type: "string",
                    required: true,
                    description: "Take id, e.g. T02.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                await api.deleteTake(
                    pid,
                    args.owner,
                    args.pass as Pass,
                    args.take,
                );
                return compact({ ok: true });
            },
        }),
        defineTool({
            name: "tongflow_dailies_note",
            description:
                "Append a dated review note (QC findings, decisions, what to redo) under dailies/. Use after inspecting takes with tongflow_look / tongflow_perceive.",
            parameters: {
                project: PROJECT_PARAM,
                subject: {
                    type: "string",
                    required: true,
                    description:
                        "Short subject, e.g. 'EP01_SC001_SH0010_KF' or 'CHR_MEI_REF review'.",
                },
                text: {
                    type: "string",
                    required: true,
                    description: "Markdown note body.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                return compact({
                    ok: true,
                    key: await api.addNote(pid, args.subject, args.text),
                });
            },
        }),
        defineTool({
            name: "tongflow_ref_resolve",
            description:
                "Resolve a tf:// reference to the files / text it currently points at (useful to check what a binding will feed a workflow).",
            parameters: {
                project: PROJECT_PARAM,
                ref: {
                    type: "string",
                    required: true,
                    description:
                        "e.g. tf://CHR_MEI/REF, tf://EP01/ANI, tf://EP01_SC001_SH0010/dialogue",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const r = await api.resolveRef(pid, args.ref);
                return compact(
                    r.kind === "files"
                        ? { kind: "files", keys: r.keys }
                        : { kind: "texts", texts: r.texts },
                );
            },
        }),
    ];
}
