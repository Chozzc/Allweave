/**
 * dsh-tongflow — browser half.
 *
 * The Studio *is* the conversation view: it registers into the
 * `conversation.view` ring under the id `chat` with a lower priority than
 * dsh's own chat entry, so it shadows it (the default view is `chat`, so the
 * studio opens as soon as a session has content). The bundle also disables the
 * trajectory tab (cordis.patch.yml), leaving a single view and no tab bar.
 * dsh's composer below the view keeps sending to the session; the studio's
 * left column mirrors the conversation.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Type-only: the 'conversation.view' SlotMap row must be in the program.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
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
                id: "chat",
                // Lower priority = head of the `chat` cell → shadows dsh's chat view.
                priority: -1,
                order: 0,
                label: "Studio",
                inject: injected,
            },
            StudioView,
        ),
    );
    ctx.effect(() => hideViewTabs(), "dsh-tongflow: hide view tabs");
}

/**
 * The session header lists every raw `conversation.view` entry as a tab —
 * including the shadowed chat entry — and hides the bar only when there is a
 * single one. There is one view worth showing (this one), so hide the ring.
 * A ".tfs-keep-tabs" class on <body> restores it for debugging.
 */
function hideViewTabs(): () => void {
    if (typeof document === "undefined") return () => undefined;
    const apply = () => {
        if (document.body.classList.contains("tfs-keep-tabs")) return;
        for (const list of document.querySelectorAll<HTMLElement>(
            '[role="tablist"]',
        )) {
            const tabs = [
                ...list.querySelectorAll<HTMLElement>('[role="tab"]'),
            ];
            if (tabs.some((t) => t.textContent?.trim() === "Studio"))
                list.style.display = "none";
        }
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
        obs.disconnect();
        for (const list of document.querySelectorAll<HTMLElement>(
            '[role="tablist"]',
        ))
            list.style.display = "";
    };
}
