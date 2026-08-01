"use client";

/**
 * Agent chat store: panel state + the client-side agentic loop.
 *
 * Each loop round POSTs the transcript to /api/agent/chat, renders streamed
 * text live, executes tool calls against the canvas, appends their results
 * and re-POSTs — until the model stops calling tools or MAX_AGENT_TURNS is
 * reached. Session-only by design (no persistence in the MVP).
 */

import { create } from "zustand";
import useFlow from "@/hooks/use-flow";
import { useTaskStore } from "@/hooks/use-task";
import { executeAgentTool } from "@/lib/agent/executor";
import { renderCanvas } from "@/lib/agent/serialize";
import type {
    AgentAttachment,
    AgentStreamEvent,
    AgentToolCall,
    AgentWireMessage,
    ToolResult,
} from "@/lib/agent/types";
import { logger } from "@/lib/logger";

const MAX_AGENT_TURNS = 16;
/** Keep the transcript bounded; oldest tool payloads are dropped first. */
const MAX_WIRE_MESSAGES = 40;

const CANVAS_DIGEST_OPEN = "\n\n<canvas-state>\n";
const CANVAS_DIGEST_CLOSE = "\n</canvas-state>";

/* ------------------------------------------------------------------ */
/* UI transcript model                                                 */
/* ------------------------------------------------------------------ */

export type AgentUiEntry =
    | { kind: "user"; text: string; attachments?: AgentAttachment[] }
    | { kind: "assistant"; text: string; streaming?: boolean }
    | {
          kind: "tool";
          name: string;
          args: Record<string, unknown>;
          result?: ToolResult;
      }
    | { kind: "error"; code?: string; message: string };

export type AgentStatus = "idle" | "streaming" | "executing";

interface AgentChatState {
    open: boolean;
    status: AgentStatus;
    entries: AgentUiEntry[];
    /** OpenAI-shaped transcript sent to the route. */
    wire: AgentWireMessage[];
    attachments: AgentAttachment[];
    pluginId: string;
    model: string;
    /** Set when the route answered 428 — drives the connect-provider card. */
    missingEnvKey: string | null;

    toggle: () => void;
    setProvider: (pluginId: string, model: string) => void;
    addAttachments: (files: AgentAttachment[]) => void;
    removeAttachment: (index: number) => void;
    send: (text: string) => Promise<void>;
    stop: () => void;
    clear: () => void;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

let abortController: AbortController | null = null;

/**
 * The digest rides on the latest user message only: older copies are
 * stripped before each request so the context never accumulates stale
 * canvas snapshots.
 */
function stripDigest(content: string): string {
    const at = content.indexOf(CANVAS_DIGEST_OPEN);
    return at >= 0 ? content.slice(0, at) : content;
}

function buildDigest(attachments: AgentAttachment[]): string {
    const { nodes, edges, selectedNodes } = useFlow.getState();
    const statusByNodeId = useTaskStore.getState().nodeExecutionStatusMap;
    const canvas = renderCanvas(nodes, edges, {
        selectedIds: selectedNodes.map((n) => n.id),
        statusByNodeId,
        maxText: 60,
    });
    const attachmentLines =
        attachments.length > 0
            ? `\nattachments:\n${attachments
                  .map(
                      (a) =>
                          `  #${a.index} ${a.modality} "${a.name}" (${a.mime})`,
                  )
                  .join("\n")}`
            : "";
    return `${CANVAS_DIGEST_OPEN}${canvas}${attachmentLines}${CANVAS_DIGEST_CLOSE}`;
}

/** Trim old messages, keeping user/assistant turns over bulky tool results. */
function boundedWire(wire: AgentWireMessage[]): AgentWireMessage[] {
    if (wire.length <= MAX_WIRE_MESSAGES) return wire;
    const overflow = wire.length - MAX_WIRE_MESSAGES;
    // Never split an assistant(tool_calls) from its tool results: drop whole
    // leading spans until under budget.
    let cut = 0;
    let dropped = 0;
    while (dropped < overflow && cut < wire.length) {
        const msg = wire[cut];
        cut++;
        dropped++;
        if (msg.role === "assistant" && msg.tool_calls?.length) {
            while (cut < wire.length && wire[cut].role === "tool") {
                cut++;
                dropped++;
            }
        }
    }
    return wire.slice(cut);
}

async function* readSse(response: Response): AsyncGenerator<AgentStreamEvent> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf("\n\n");
        while (sep >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            sep = buffer.indexOf("\n\n");
            const data = frame
                .split("\n")
                .filter((l) => l.startsWith("data: "))
                .map((l) => l.slice("data: ".length))
                .join("");
            if (!data) continue;
            try {
                yield JSON.parse(data) as AgentStreamEvent;
            } catch {
                logger.warn("[agent] bad SSE frame:", data.slice(0, 200));
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useAgentChat = create<AgentChatState>((set, get) => ({
    open: false,
    status: "idle",
    entries: [],
    wire: [],
    attachments: [],
    pluginId: "",
    model: "",
    missingEnvKey: null,

    toggle: () => set((s) => ({ open: !s.open })),

    setProvider: (pluginId, model) =>
        set({ pluginId, model, missingEnvKey: null }),

    addAttachments: (files) =>
        set((s) => {
            const base = s.attachments.length;
            const withIndex = files.map((f, i) => ({
                ...f,
                index: base + i + 1,
            }));
            return { attachments: [...s.attachments, ...withIndex] };
        }),

    removeAttachment: (index) =>
        set((s) => ({
            attachments: s.attachments
                .filter((a) => a.index !== index)
                .map((a, i) => ({ ...a, index: i + 1 })),
        })),

    stop: () => {
        abortController?.abort();
        abortController = null;
        set((s) => ({
            status: "idle",
            entries: s.entries.map((e) =>
                e.kind === "assistant" ? { ...e, streaming: false } : e,
            ),
        }));
    },

    clear: () => {
        abortController?.abort();
        abortController = null;
        set({
            entries: [],
            wire: [],
            attachments: [],
            status: "idle",
            missingEnvKey: null,
        });
    },

    send: async (text) => {
        const state = get();
        if (state.status !== "idle" || !text.trim()) return;
        if (!state.pluginId) {
            set({ missingEnvKey: "" });
            return;
        }

        const turnId = crypto.randomUUID().slice(0, 8);
        const attachments = state.attachments;

        // Strip stale digests from history, attach a fresh one to this turn.
        const history = state.wire.map((m) =>
            m.role === "user" ? { ...m, content: stripDigest(m.content) } : m,
        );
        let wire: AgentWireMessage[] = boundedWire([
            ...history,
            { role: "user", content: text + buildDigest(attachments) },
        ]);

        set((s) => ({
            status: "streaming",
            missingEnvKey: null,
            entries: [
                ...s.entries,
                {
                    kind: "user",
                    text,
                    ...(attachments.length > 0 ? { attachments } : {}),
                },
            ],
        }));

        abortController = new AbortController();

        try {
            for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
                const { pluginId, model } = get();
                const response = await fetch("/api/agent/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: abortController.signal,
                    body: JSON.stringify({
                        messages: wire,
                        pluginId,
                        model,
                        locale: document.documentElement.lang || undefined,
                    }),
                });

                if (!response.ok) {
                    const err = (await response.json().catch(() => ({}))) as {
                        error?: string;
                        envKey?: string;
                        message?: string;
                    };
                    if (response.status === 428) {
                        set({ missingEnvKey: err.envKey ?? "" });
                    } else {
                        set((s) => ({
                            entries: [
                                ...s.entries,
                                {
                                    kind: "error",
                                    code: err.error,
                                    message:
                                        err.message ??
                                        `HTTP ${response.status}`,
                                },
                            ],
                        }));
                    }
                    return;
                }

                // Stream this round.
                let assistantText = "";
                const toolCalls: {
                    id: string;
                    name: string;
                    args: Record<string, unknown>;
                }[] = [];
                set((s) => ({
                    entries: [
                        ...s.entries,
                        { kind: "assistant", text: "", streaming: true },
                    ],
                }));
                const patchAssistant = (
                    updater: (
                        e: Extract<AgentUiEntry, { kind: "assistant" }>,
                    ) => AgentUiEntry,
                ) =>
                    set((s) => {
                        const entries = [...s.entries];
                        for (let i = entries.length - 1; i >= 0; i--) {
                            const e = entries[i];
                            if (e.kind === "assistant") {
                                entries[i] = updater(e);
                                break;
                            }
                        }
                        return { entries };
                    });

                let streamError: string | null = null;
                for await (const event of readSse(response)) {
                    if (event.type === "text_delta") {
                        assistantText += event.text;
                        patchAssistant((e) => ({
                            ...e,
                            text: assistantText,
                        }));
                    } else if (event.type === "tool_call") {
                        toolCalls.push({
                            id: event.id,
                            name: event.name,
                            args: event.arguments,
                        });
                    } else if (event.type === "error") {
                        streamError = event.message;
                    }
                }
                patchAssistant((e) => ({ ...e, streaming: false }));

                if (streamError) {
                    set((s) => ({
                        entries: [
                            ...s.entries,
                            { kind: "error", message: streamError },
                        ],
                    }));
                    return;
                }

                const wireCalls: AgentToolCall[] = toolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: {
                        name: c.name,
                        arguments: JSON.stringify(c.args),
                    },
                }));
                wire = [
                    ...wire,
                    {
                        role: "assistant",
                        content: assistantText || null,
                        ...(wireCalls.length > 0
                            ? { tool_calls: wireCalls }
                            : {}),
                    },
                ];

                if (toolCalls.length === 0) return; // model is done

                // Execute sequentially so the canvas grows step by step.
                set({ status: "executing" });
                for (const call of toolCalls) {
                    set((s) => ({
                        entries: [
                            ...s.entries,
                            { kind: "tool", name: call.name, args: call.args },
                        ],
                    }));
                    const result = await executeAgentTool(
                        call.name,
                        call.args,
                        {
                            attachments: get().attachments,
                            turnId,
                        },
                    );
                    set((s) => {
                        const entries = [...s.entries];
                        for (let i = entries.length - 1; i >= 0; i--) {
                            const e = entries[i];
                            if (e.kind === "tool" && !e.result) {
                                entries[i] = { ...e, result };
                                break;
                            }
                        }
                        return { entries };
                    });
                    wire = [
                        ...wire,
                        {
                            role: "tool",
                            tool_call_id: call.id,
                            content: JSON.stringify(result),
                        },
                    ];
                }
                set({ status: "streaming" });
                wire = boundedWire(wire);
            }

            set((s) => ({
                entries: [
                    ...s.entries,
                    {
                        kind: "error",
                        code: "turn_limit",
                        message: `stopped after ${MAX_AGENT_TURNS} rounds`,
                    },
                ],
            }));
        } catch (e) {
            if ((e as Error).name !== "AbortError") {
                logger.error("[agent] loop failed:", e);
                set((s) => ({
                    entries: [
                        ...s.entries,
                        { kind: "error", message: String(e) },
                    ],
                }));
            }
        } finally {
            abortController = null;
            // Attachments were consumed by this turn (referenced or not).
            set({ status: "idle", wire, attachments: [] });
        }
    },
}));
