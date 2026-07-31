import { dispatchTask } from "@ext/task-dispatch";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { isTerminalStatus } from "@/constants/task-status";
import { getDb, tasks } from "@/db";
import { jsonStringifyForSse } from "@/lib/json-sse";
import { logger } from "@/lib/logger";
import { getScope, runWithScope } from "@/lib/runtime/scope.server";
import {
    directStreamUrl,
    isTaskRunning,
    onTaskEvent,
    type TaskEvent,
} from "@/lib/task/emitter";

/**
 * GET /api/task/wait?taskId=xxx&reconnect=false
 *
 * SSE endpoint that streams real-time task execution status.
 * Replaces the Python openapi /wait endpoint.
 *
 * - Non-reconnect mode: starts task execution and listens for events
 * - Reconnect mode: only listens for events of an already-running task
 */
export async function GET(request: NextRequest) {
    const taskId = request.nextUrl.searchParams.get("taskId");
    const reconnect = request.nextUrl.searchParams.get("reconnect") === "true";

    if (!taskId) {
        return new Response("taskId is required", { status: 400 });
    }

    // Reconnect mode: check whether the task is still running
    if (reconnect && !isTaskRunning(taskId)) {
        return new Response("Task does not exist or has already completed", {
            status: 404,
        });
    }

    // Resolve the tenant scope while the request context is still available;
    // the execution below outlives it, so pin the scope via ALS.
    const scope = await getScope();

    // Terminal fast-path: a finished task must never be re-dispatched or
    // re-streamed (a direct-stream reconnect would re-execute the slot).
    // Replay the stored terminal state as a single SSE frame and close.
    const db = await getDb();
    const row = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
    });
    if (row && (row.status === "completed" || row.status === "failed")) {
        const done = row.status === "completed";
        let data: Record<string, unknown> = {};
        try {
            data = JSON.parse(
                (done ? row.result : row.error) ?? "{}",
            ) as Record<string, unknown>;
        } catch {
            /* legacy rows may hold plain text — replay an empty payload */
        }
        const frame = `data: ${jsonStringifyForSse({
            id: taskId,
            status: done ? "COMPLETED" : "FAILED",
            nodeId: row.nodeId,
            data,
        })}\n\n`;
        return new Response(frame, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    }

    // Direct stream mode (remote executors): kick off execution, then 302
    // the EventSource to the external SSE endpoint — progress flows from
    // the executor to the browser without passing through this server.
    // Dispatch must complete BEFORE the redirect response: serverless
    // runtimes cancel work still pending when the response returns.
    const direct = await directStreamUrl(taskId);
    if (direct) {
        if (!reconnect) {
            try {
                await runWithScope(scope, () => dispatchTask(taskId));
            } catch (error) {
                logger.error(`[SSE] Failed to start task ${taskId}:`, error);
            }
        }
        return Response.redirect(direct, 302);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            let closed = false;

            function close() {
                if (!closed) {
                    closed = true;
                    unsubscribe();
                    controller.close();
                }
            }

            // Subscribe to task events
            const unsubscribe = onTaskEvent(taskId, (event: TaskEvent) => {
                if (closed) return;

                try {
                    const data = jsonStringifyForSse(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));

                    // Terminal state → close the SSE connection
                    if (isTerminalStatus(event.status)) {
                        logger.debug(
                            `[SSE] Task ${taskId} reached terminal status: ${event.status}`,
                        );
                        close();
                    }
                } catch {
                    close();
                }
            });

            // Heartbeat timer (every 10 seconds)
            const heartbeat = setInterval(() => {
                if (closed) {
                    clearInterval(heartbeat);
                    return;
                }
                try {
                    controller.enqueue(encoder.encode(": ping\n\n"));
                } catch {
                    clearInterval(heartbeat);
                    close();
                }
            }, 10_000);

            // Clean up when the client disconnects
            request.signal.addEventListener("abort", () => {
                clearInterval(heartbeat);
                close();
            });

            // Non-reconnect mode: start task execution
            if (!reconnect) {
                runWithScope(scope, () => dispatchTask(taskId)).catch(
                    (error) => {
                        logger.error(
                            `[SSE] Failed to start task ${taskId}:`,
                            error,
                        );
                        if (!closed) {
                            try {
                                const errEvent = jsonStringifyForSse({
                                    id: taskId,
                                    status: "FAILED",
                                    data: {
                                        message: "Task failed to start",
                                        errorCode: "task_failed_to_start",
                                        error: String(error),
                                    },
                                });
                                controller.enqueue(
                                    encoder.encode(`data: ${errEvent}\n\n`),
                                );
                            } catch {
                                // ignore
                            }
                            close();
                        }
                    },
                );
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
