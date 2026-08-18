/**
 * dsh-tongflow — browser half.
 *
 * Adds a "Studio" action to the sidebar footer; it opens the studio as a
 * frame-wide overlay (independent of the current session). Everything except
 * the shell's platform modules is bundled into lib/client.js.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Type-only: the 'sidebar.footer.action' SlotMap row must be in the program.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { StudioLauncher } from "./studio/StudioLauncher.tsx";
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
    // Embedded: a "Studio" tab in the conversation view ring (needs an open session).
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
    // Always available: sidebar footer button → frame-wide overlay (works before any session exists).
    ctx.slots.inject("sidebar.footer.action", () =>
        ctx.slots.register(
            {
                name: "sidebar.footer.action",
                id: "tongflow-studio",
                order: 20,
                inject: injected,
            },
            StudioLauncher,
        ),
    );
}
