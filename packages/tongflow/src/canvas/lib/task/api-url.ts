/**
 * Request URLs for task SSE (wait) and stop, served by the TongFlow API.
 */

import { apiUrl } from "../../host";

export function getTaskWaitUrl(taskId: string, reconnect?: boolean): string {
    const params = new URLSearchParams({ taskId });
    if (reconnect) {
        params.set("reconnect", "true");
    }
    return apiUrl(`/api/task/wait?${params.toString()}`);
}

export function getTaskStopUrl(): string {
    return apiUrl("/api/task/stop");
}
