/**
 * Global task event system.
 *
 * Backend seam: the default (src/ext-default/task-events.ts) is an
 * in-process EventEmitter — it replaces Redis pub/sub for the single-
 * process open-source/desktop build. A cloud shell substitutes a
 * cross-instance backend (e.g. a Durable Object event log) via
 * src/ext/task-events.ts. SSE endpoints listen for events, and handlers
 * publish events.
 */

import type { SSEStatusType } from "tongflow";

export interface TaskEvent {
    id: string;
    status: SSEStatusType | string;
    nodeId?: string | null;
    data?: Record<string, unknown>;
}

export {
    abortTask,
    directStreamUrl,
    emitTaskEvent,
    isTaskRunning,
    notifyTask,
    onTaskEvent,
    registerTask,
    removeTask,
    runningTaskCount,
} from "@ext/task-events";
