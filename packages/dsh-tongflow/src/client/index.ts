/**
 * dsh-tongflow — browser half.
 *
 * Two registrations:
 *  - the Studio as a `conversation.view` entry (`tongflow-studio`);
 *  - a header watcher that, for studio sessions only (first message starts
 *    with "@tongflow", or the cwd is a studio project), activates that view
 *    and hides the tab ring. Plain sessions keep dsh's chat untouched.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Type-only: the conversation SlotMap rows must be in the program.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { StudioModeWatcher } from "./studio/StudioModeWatcher.tsx";
import { type StudioInjected, StudioView } from "./studio/StudioView.tsx";

export const inject = ["slots", "workspaces", "sessions"];

export function apply(ctx: ClientContext): void {
    const locale = (
        typeof navigator !== "undefined" ? navigator.language : "en"
    ).split("-")[0];
    const injected = (): StudioInjected => ({
        locale,
        openWorkspace: async (path: string) => {
            const ws = await ctx.workspaces.create({ path });
            ctx.workspaces.startSession(ws.workspaceId);
        },
    });
    ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
            {
                name: "conversation.view",
                id: "tongflow-studio",
                order: 50,
                label: "Studio",
                inject: injected,
            },
            StudioView,
        ),
    );
    ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
            {
                name: "conversation.session.header.utilities",
                id: "tongflow-mode",
                order: 5,
            },
            StudioModeWatcher,
        ),
    );
}
