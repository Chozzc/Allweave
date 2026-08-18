import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";

export type StudioViewProps = PropsRuntime<"conversation.view">;

export function StudioView(_props: StudioViewProps) {
    return (
        <div style={{ padding: 16 }}>
            <h2>TongFlow Studio</h2>
            <p>Skeleton — studio panes land in follow-up steps.</p>
        </div>
    );
}
