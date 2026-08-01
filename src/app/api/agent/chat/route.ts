import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { resolveAgentProvider } from "@/lib/agent/chat-adapters";
import { buildSystemPrompt } from "@/lib/agent/prompt.server";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import type { AgentChatRequest, AgentStreamEvent } from "@/lib/agent/types";
import { jsonStringifyForSse } from "@/lib/json-sse";
import { logger } from "@/lib/logger";
import { loadEnvStore } from "@/lib/settings/env-store.server";

/**
 * POST /api/agent/chat — one stateless streaming LLM turn.
 *
 * The agentic loop (tool execution, canvas mutation, history) lives in the
 * browser; this route only resolves the selected plugin's key from the env
 * store, injects the system prompt, and re-emits the upstream stream as SSE.
 * One upstream fetch piped to one response keeps it Workers-compatible.
 */

/** Total serialized request budget — the client truncates long histories. */
const MAX_BODY_BYTES = 400_000;
const MAX_MESSAGES = 120;

export async function POST(request: NextRequest) {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
        return Response.json({ error: "request too large" }, { status: 413 });
    }

    let body: AgentChatRequest;
    try {
        body = JSON.parse(raw) as AgentChatRequest;
    } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (
        !Array.isArray(body.messages) ||
        body.messages.length === 0 ||
        body.messages.length > MAX_MESSAGES ||
        typeof body.pluginId !== "string"
    ) {
        return Response.json({ error: "invalid request" }, { status: 400 });
    }

    const env = await loadEnvStore();
    const resolved = resolveAgentProvider(body.pluginId, env);
    if (!resolved.ok) {
        // 428: the client shows the "connect a provider" card and deep-links
        // to settings with the missing env key.
        return Response.json(
            { error: resolved.error, envKey: resolved.envKey },
            { status: resolved.error === "missing_key" ? 428 : 400 },
        );
    }

    const client = new OpenAI({
        baseURL: resolved.provider.baseURL,
        apiKey: resolved.provider.apiKey,
    });

    let upstream: Awaited<ReturnType<typeof client.chat.completions.create>> &
        AsyncIterable<OpenAI.ChatCompletionChunk>;
    try {
        upstream = (await client.chat.completions.create({
            model: body.model || "",
            stream: true,
            messages: [
                { role: "system", content: buildSystemPrompt(body.locale) },
                ...(body.messages as OpenAI.ChatCompletionMessageParam[]),
            ],
            tools: AGENT_TOOLS,
            tool_choice: "auto",
            // Sequential tool execution keeps the on-canvas build legible.
            parallel_tool_calls: false,
        })) as typeof upstream;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("[agent/chat] upstream request failed:", message);
        return Response.json(
            { error: "upstream_error", message },
            { status: 502 },
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let closed = false;
            const close = () => {
                if (!closed) {
                    closed = true;
                    try {
                        controller.close();
                    } catch {
                        /* already closed */
                    }
                }
            };
            const emit = (event: AgentStreamEvent) => {
                if (closed) return;
                controller.enqueue(
                    encoder.encode(`data: ${jsonStringifyForSse(event)}\n\n`),
                );
            };

            request.signal.addEventListener("abort", close);

            // Argument fragments stream as partial JSON; buffer per tool-call
            // index and emit each call only once complete so the client never
            // parses half a JSON document.
            const pendingCalls = new Map<
                number,
                { id: string; name: string; args: string }
            >();
            let finishReason = "stop";

            const flushCalls = () => {
                for (const call of pendingCalls.values()) {
                    let parsed: Record<string, unknown> = {};
                    try {
                        parsed = call.args
                            ? (JSON.parse(call.args) as Record<string, unknown>)
                            : {};
                    } catch {
                        emit({
                            type: "error",
                            message: `tool call ${call.name}: arguments were not valid JSON`,
                        });
                        continue;
                    }
                    emit({
                        type: "tool_call",
                        id: call.id,
                        name: call.name,
                        arguments: parsed,
                    });
                }
                pendingCalls.clear();
            };

            try {
                for await (const chunk of upstream) {
                    if (closed) break;
                    const choice = chunk.choices?.[0];
                    if (!choice) continue;

                    const delta = choice.delta;
                    if (delta?.content) {
                        emit({ type: "text_delta", text: delta.content });
                    }
                    for (const tc of delta?.tool_calls ?? []) {
                        const entry = pendingCalls.get(tc.index) ?? {
                            id: tc.id ?? "",
                            name: "",
                            args: "",
                        };
                        if (tc.id) entry.id = tc.id;
                        if (tc.function?.name) entry.name = tc.function.name;
                        if (tc.function?.arguments) {
                            entry.args += tc.function.arguments;
                        }
                        pendingCalls.set(tc.index, entry);
                    }

                    if (choice.finish_reason) {
                        finishReason = choice.finish_reason;
                        flushCalls();
                    }
                }
                emit({ type: "done", finishReason });
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                logger.error("[agent/chat] stream failed:", message);
                emit({ type: "error", message });
            } finally {
                close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
