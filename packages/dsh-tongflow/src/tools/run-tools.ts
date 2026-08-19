/**
 * Execution & perception tools: run a workflow (foreground or as a dsh
 * background job), look at a generated image (returned as an image block so a
 * vision model sees it), perceive video/audio through TongFlow's own
 * describe / transcribe slots, and manage plugins.
 */
import { execFile as execFileCb } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type {
    AttachmentStore,
    ImageAttachmentRef,
    ImageMediaType,
} from "@deepseek-ai/dsh-attachment";
import type { JobRegistry } from "@deepseek-ai/dsh-jobs";
import type { JsonValue } from "@deepseek-ai/dsh-session";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { RunRecord } from "../engine/runs.ts";
import { formatEvent } from "../engine/runs.ts";
import { modalityOfExt } from "../shared/types.ts";
import {
    compact,
    errorMessage,
    PROJECT_PARAM,
    resolveProjectId,
    type ToolEnv,
    text,
} from "./support.ts";

const execFile = promisify(execFileCb);

declare module "@deepseek-ai/dsh-jobs" {
    interface JobKindMap {
        tongflow: "tongflow";
    }
}

const WORKFLOW_PARAM = {
    type: "string",
    required: true,
    description:
        "Workflow file, project-relative, e.g. 'characters/mei/mei_ref' or 'characters/mei/mei_ref.tongflow.json'.",
} as const;

const IMAGE_MIME: Record<string, ImageMediaType> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
};

function runResult(record: RunRecord): JsonValue {
    const s = record.summary;
    return compact({
        runId: s.runId,
        status: s.status,
        ...(s.error ? { error: s.error } : {}),
        no: record.outcome?.no ?? 0,
        files: s.files.map((f) => f.key),
        texts: record.outcome?.texts ?? {},
        loose: record.outcome?.loose ?? [],
        nodes: s.nodes,
        log: record.events.slice(-30).map(formatEvent).filter(Boolean),
    });
}

export function runTools(env: ToolEnv): ToolDefinition[] {
    const { api, ctx, studio } = env;
    return [
        defineTool({
            name: "tongflow_workflow_run",
            description:
                "Execute a workflow file with the TongFlow engine. Its outputs land next to the file as <name>.NN.<ext> (NN = this run's number; a run never overwrites earlier outputs) and the run is logged in <name>.runs.json. " +
                "Media generation takes seconds to minutes; use run_in_background for long jobs (video, batches) and continue working — you are notified when it completes. " +
                "After a run, inspect the result with tongflow_look (images) or tongflow_perceive (video/audio) before moving on; if it is off, fix the workflow and run again. " +
                "BILLING CHECKPOINT: a run that uses a paid plugin (API key billing or Modal GPU time) needs the user's yes EVERY time. Without user_confirmed=true this tool does not run — it returns needs_confirmation with the plugins, how each is billed, whether keys are set, available models and alternatives. Tell the user in plain words what will run and what it costs, ask, and only after they agree in this conversation call again with user_confirmed=true. Never set it on your own; nothing is remembered between runs.",
            parameters: {
                project: PROJECT_PARAM,
                workflow: WORKFLOW_PARAM,
                inputs: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "input name → text | file path (relative to the workflow file or the project root) | URL | array of those. Only for workflows that left inputs open.",
                },
                note: {
                    type: "string",
                    description:
                        "Why this run / what changed (recorded in provenance).",
                },
                run_in_background: {
                    type: "boolean",
                    description:
                        "Return immediately with a job id; poll with job_output / job_list or wait for the completion notice.",
                },
                user_confirmed: {
                    type: "boolean",
                    description:
                        "Set to true ONLY after the user explicitly agreed, in this conversation, to this run and its billing (the plugins / models listed in the needs_confirmation answer). Required whenever the workflow uses a paid plugin.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                if (!args.user_confirmed) {
                    const paid = await api.paidPlugins(pid, args.workflow);
                    if (paid.length > 0) {
                        return compact({
                            ok: false,
                            needs_confirmation: true,
                            plugins: paid,
                            hint: "This run costs money. Tell the user which plugin(s) / model(s) will run and how they are billed (mention alternatives when there are any, and missing API keys), ask whether to go ahead, and only after they say yes call again with user_confirmed=true. Ask every time; do not assume a previous yes still holds.",
                        });
                    }
                }
                const record = await api.startRun({
                    projectId: pid,
                    workflowKey: args.workflow,
                    ...(args.inputs
                        ? { inputs: args.inputs as Record<string, unknown> }
                        : {}),
                    ...(args.note ? { note: args.note } : {}),
                });
                if (args.run_in_background) {
                    const jobs = ctx.get("jobs") as JobRegistry | undefined;
                    if (!jobs) {
                        // No job runtime: degrade to foreground.
                        await record.done;
                        return runResult(record);
                    }
                    const jobId = jobs.start({
                        kind: "tongflow",
                        label: `tongflow ${args.workflow}`,
                        ...(exec.agent ? { owner: exec.agent } : {}),
                        run: () => ({
                            cancel: (reason) => record.cancel(reason),
                            done: record.done.then((r) => ({
                                status:
                                    r.summary.status === "completed"
                                        ? ("completed" as const)
                                        : r.summary.status === "cancelled"
                                          ? ("killed" as const)
                                          : ("failed" as const),
                                ...(r.error ? { detail: r.error } : {}),
                                output: JSON.stringify(runResult(r), null, 2),
                            })),
                            readOutput: () => record.readOutput(),
                        }),
                    });
                    return compact({
                        kind: "background",
                        jobId,
                        runId: record.summary.runId,
                        hint: "poll with job_output or wait for the completion notice; then tongflow_look the new file",
                    });
                }
                const finished = await Promise.race([
                    record.done,
                    new Promise<never>((_, reject) =>
                        exec.signal.addEventListener(
                            "abort",
                            () => reject(new Error("cancelled")),
                            { once: true },
                        ),
                    ),
                ]).catch((error) => {
                    record.cancel(errorMessage(error));
                    throw error;
                });
                return runResult(finished);
            },
        }),
        defineTool({
            name: "tongflow_run_status",
            description:
                "Status, node progress and log of a run (or the recent runs of a project).",
            parameters: {
                project: PROJECT_PARAM,
                runId: {
                    type: "string",
                    description:
                        "Run id from tongflow_workflow_run; omit to list recent runs.",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                if (args.runId) {
                    const r = api.getRun(args.runId);
                    if (!r)
                        return {
                            ok: false,
                            error: `unknown run ${args.runId}`,
                        };
                    return runResult(r);
                }
                const pid = await resolveProjectId(env, exec, args.project);
                return compact(api.listRuns(pid).slice(0, 20));
            },
        }),
        defineTool({
            name: "tongflow_look",
            description:
                "Look at an asset. Images are returned as an image you can see (requires a vision-capable model route). Videos are returned as a contact sheet of sampled frames plus duration/resolution. " +
                "Audio returns metadata only — use tongflow_perceive for content. Takes a project-relative path (e.g. 'characters/mei/mei_ref.02.png').",
            parameters: {
                project: PROJECT_PARAM,
                ref: {
                    type: "string",
                    required: true,
                    description: "Project-relative path of the file.",
                },
                frames: {
                    type: "integer",
                    description:
                        "Frames in the video contact sheet (default 9, max 16).",
                },
            },
            output: {
                schema: { type: "json" },
                render: (_a, v) => {
                    const val = v as {
                        attachment?: ImageAttachmentRef;
                        summary?: string;
                    };
                    const blocks = text(val.summary ?? JSON.stringify(v));
                    if (val.attachment)
                        blocks.push({
                            type: "image",
                            attachment: val.attachment,
                        });
                    return blocks;
                },
            },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const path = await resolveToFile(env, pid, args.ref);
                const ext = extname(path).slice(1).toLowerCase();
                const modality = modalityOfExt(ext);
                const st = await stat(path);
                const attachments = ctx.get("attachments") as
                    | AttachmentStore
                    | undefined;
                if (modality === "image") {
                    const mime = IMAGE_MIME[ext];
                    if (!mime)
                        return compact({
                            summary: `${args.ref}: ${ext} image (${st.size} bytes) — unsupported for inline viewing (png/jpg/webp/gif only)`,
                        });
                    if (!attachments)
                        return compact({
                            summary: `${args.ref}: image ${st.size} bytes at ${path} (attachments service not mounted; cannot show inline)`,
                        });
                    const attachment = await attachments.saveImage({
                        data: new Uint8Array(await readFile(path)),
                        mediaType: mime,
                        name: path.split("/").pop(),
                    });
                    return compact({
                        summary: `${args.ref} → ${st.size} bytes, ${attachment.width}×${attachment.height}`,
                        attachment,
                        path,
                    });
                }
                if (modality === "video") {
                    const probe = await ffprobe(path).catch((e) => ({
                        error: errorMessage(e),
                    }));
                    if (!attachments)
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes`,
                            probe,
                        });
                    try {
                        const sheet = await contactSheet(
                            path,
                            Math.min(Math.max(args.frames ?? 9, 1), 16),
                            studio.paths.tmp,
                        );
                        const attachment = await attachments.saveImage({
                            data: new Uint8Array(await readFile(sheet)),
                            mediaType: "image/jpeg",
                            name: "contact-sheet.jpg",
                        });
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes; ${JSON.stringify(probe)}. Contact sheet of ${args.frames ?? 9} frames follows (left→right, top→bottom).`,
                            probe,
                            attachment,
                        });
                    } catch (error) {
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes; ${JSON.stringify(probe)}. (contact sheet unavailable: ${errorMessage(error)}; use tongflow_perceive)`,
                            probe,
                        });
                    }
                }
                if (modality === "audio") {
                    const probe = await ffprobe(path).catch((e) => ({
                        error: errorMessage(e),
                    }));
                    return compact({
                        summary: `${args.ref}: audio ${st.size} bytes; ${JSON.stringify(probe)}. Use tongflow_perceive to transcribe / describe.`,
                        probe,
                    });
                }
                if (modality === "text") {
                    const body = await readFile(path, "utf8");
                    return compact({
                        summary:
                            body.length > 8000
                                ? `${body.slice(0, 8000)}\n… (${body.length} chars)`
                                : body,
                    });
                }
                return compact({
                    summary: `${args.ref}: ${modality} file, ${st.size} bytes at ${path}`,
                });
            },
        }),
        defineTool({
            name: "tongflow_perceive",
            description:
                "Understand a video, audio or image through TongFlow's describe/transcribe slots (video-describe, audio-describe / transcribe, image-describe) using an installed plugin — this is how you review generated media the chat model cannot ingest directly. " +
                "Ask a concrete question: continuity with the reference, lip sync, motion quality, whether the line was spoken correctly, etc.",
            parameters: {
                project: PROJECT_PARAM,
                ref: {
                    type: "string",
                    required: true,
                    description: "Project-relative path of the media file.",
                },
                question: {
                    type: "string",
                    description:
                        "What to look/listen for. Default: a detailed description (or transcript for audio).",
                },
                mode: {
                    type: "string",
                    enum: ["describe", "transcribe"],
                    description:
                        "For audio: 'transcribe' (default) or 'describe'.",
                },
                pluginId: {
                    type: "string",
                    description:
                        "Force a specific plugin (default: the first installed one for the slot).",
                },
            },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const pid = await resolveProjectId(env, exec, args.project);
                const path = await resolveToFile(env, pid, args.ref);
                const modality = modalityOfExt(extname(path).slice(1));
                let feature: string;
                let prompt: Record<string, unknown>;
                const question = args.question ?? "";
                if (modality === "video") {
                    feature = "video-describe";
                    prompt = {
                        video: path,
                        text:
                            question ||
                            "Describe this video in detail: subjects, action, camera, continuity issues.",
                        userPrompt: question,
                    };
                } else if (modality === "audio") {
                    if ((args.mode ?? "transcribe") === "transcribe") {
                        feature = "transcribe";
                        prompt = {
                            audio: path,
                            ...(question ? { context: question } : {}),
                        };
                    } else {
                        feature = "audio-describe";
                        prompt = {
                            audio: path,
                            text: question || "Describe this audio.",
                            userPrompt: question,
                        };
                    }
                } else if (modality === "image") {
                    feature = "image-describe";
                    prompt = {
                        image: path,
                        text: question || "Describe this image in detail.",
                        userPrompt: question,
                    };
                } else {
                    return {
                        ok: false,
                        error: `${args.ref} is not a video/audio/image`,
                    };
                }
                const { registry } = await api.registry();
                const pluginId =
                    args.pluginId ?? registry.nodePluginMap[feature]?.[0];
                if (!pluginId) {
                    return {
                        ok: false,
                        error: `no installed plugin implements ${feature}; install one (e.g. tongflow-api-gemini or tongflow-modal-qwen38) with tongflow_plugins_install`,
                    };
                }
                const record = await api.startCanvasRun(pid, {
                    feature,
                    pluginId,
                    prompt,
                    nodeId: "perceive",
                });
                await record.done;
                if (record.summary.status !== "completed")
                    return compact({
                        ok: false,
                        error: record.error ?? "perception run failed",
                        log: record.events.slice(-10).map(formatEvent),
                    });
                const texts = record.outcome?.texts ?? {};
                const answer = Object.values(texts).flat().join("\n").trim();
                return compact({
                    ok: true,
                    feature,
                    pluginId,
                    answer: answer || "(empty answer)",
                    raw: record.outcome?.result.outputs,
                });
            },
        }),
        defineTool({
            name: "tongflow_plugins_list",
            description:
                "Installed TongFlow plugins (id, name, ABI slots they implement, required env keys) and the official plugin ids that can be installed.",
            parameters: {},
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute() {
                const { registry, meta } = await api.registry();
                const { OFFICIAL_PLUGINS } = await import(
                    "../engine/registry.ts"
                );
                const installed = Object.entries(registry.plugins).map(
                    ([id, p]) => ({
                        id,
                        name: (p as { name?: string }).name ?? id,
                        slots: Object.keys(
                            (
                                p as {
                                    methodsByNodeSlot: Record<string, unknown>;
                                }
                            ).methodsByNodeSlot,
                        ),
                        env: (meta[id]?.env ?? []).map(
                            (e) => `${e.key}${e.required ? "*" : ""}`,
                        ),
                    }),
                );
                return compact({
                    installed,
                    official: OFFICIAL_PLUGINS.filter(
                        (id) => !registry.plugins[id],
                    ),
                    errors: registry.errors ?? [],
                });
            },
        }),
        defineTool({
            name: "tongflow_plugins_install",
            description:
                "Install a TongFlow plugin by official id (e.g. tongflow-api-gemini, tongflow-modal-qwen38) or git URL. Plugins run in their own Python env; API keys go into the tongflow settings.",
            parameters: { idOrUrl: { type: "string", required: true } },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args, exec) {
                const r = await api.installPlugin(args.idOrUrl);
                void exec;
                const { meta } = await api.registry();
                return compact({ ...r, env: meta[r.id]?.env ?? [] });
            },
        }),
        defineTool({
            name: "tongflow_plugins_uninstall",
            description: "Remove an installed TongFlow plugin.",
            parameters: { id: { type: "string", required: true } },
            output: { schema: { type: "json" }, render: (_a, v) => text(v) },
            async execute(args) {
                await api.uninstallPlugin(args.id);
                return { ok: true };
            },
        }),
    ];
}

async function resolveToFile(
    env: ToolEnv,
    projectId: string,
    ref: string,
): Promise<string> {
    return env.api.filePath(projectId, ref);
}

async function ffprobe(path: string): Promise<JsonValue> {
    const { stdout } = await execFile("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
        "-of",
        "json",
        path,
    ]);
    const parsed = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Record<string, unknown>[];
    };
    return compact({
        duration: parsed.format?.duration
            ? Number(Number(parsed.format.duration).toFixed(2))
            : undefined,
        streams: (parsed.streams ?? []).map((s) =>
            Object.fromEntries(
                Object.entries(s).filter(([, v]) => v !== undefined),
            ),
        ),
    });
}

/** Sample `n` frames evenly across the video and tile them into one JPEG. */
async function contactSheet(
    path: string,
    n: number,
    tmpDir: string,
): Promise<string> {
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const out = join(
        tmpDir,
        `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
    );
    const probe = (await ffprobe(path)) as { duration?: number };
    const duration = probe.duration && probe.duration > 0 ? probe.duration : 1;
    const fps = n / duration;
    await execFile("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        path,
        "-vf",
        `fps=${fps},scale=480:-2,tile=${cols}x${rows}`,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        out,
    ]);
    return out;
}
