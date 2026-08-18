/**
 * Mounted in the session header for every session with content. Decides
 * whether the session is a *studio session* — its first user message starts
 * with "@tongflow" — and, if so, activates the Studio view and hides the view
 * tab ring. Plain sessions are left untouched (dsh chat, tabs and all).
 */

import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect } from "react";

export type StudioModeWatcherProps =
    PropsRuntime<"conversation.session.header.utilities">;

const TRIGGER = "@tongflow";
export function isStudioText(text: string | undefined): boolean {
    return (
        typeof text === "string" &&
        text.trimStart().toLowerCase().startsWith(TRIGGER)
    );
}

function firstUserText(nodes: readonly unknown[]): string | undefined {
    for (const n of nodes as {
        kind?: string;
        content?: { type?: string; text?: string }[];
    }[]) {
        if (n.kind === "user")
            return n.content?.find((b) => b.type === "text")?.text;
    }
    return undefined;
}

/** Find the session view tab ring and the Studio tab inside it. */
function findTabs():
    | { list: HTMLElement; studio: HTMLElement | undefined; active: boolean }
    | undefined {
    for (const list of document.querySelectorAll<HTMLElement>(
        '[role="tablist"]',
    )) {
        const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
        const studioTab = tabs.find((t) => t.textContent?.trim() === "Studio");
        if (studioTab)
            return {
                list,
                studio: studioTab,
                active: studioTab.getAttribute("aria-selected") === "true",
            };
    }
    return undefined;
}

export function StudioModeWatcher({
    useSession,
    sessionId,
}: StudioModeWatcherProps) {
    const firstText = useSession((s) => firstUserText(s.nodes));
    const studioMode = isStudioText(firstText);

    useEffect(() => {
        // Studio session: activate the Studio view and hide the tab ring.
        // Plain session: hide only the Studio tab; dsh's own tabs stay.
        const apply = () => {
            const found = findTabs();
            if (!found) return;
            if (studioMode) {
                if (!found.active) found.studio?.click();
                found.list.style.display = "none";
            } else {
                found.list.style.display = "";
                if (found.studio) found.studio.style.display = "none";
            }
        };
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["aria-selected"],
        });
        return () => {
            obs.disconnect();
            const found = findTabs();
            if (found) {
                found.list.style.display = "";
                if (found.studio) found.studio.style.display = "";
            }
        };
    }, [studioMode, sessionId]);

    if (!studioMode) return null;
    return (
        <span className="tfs-mode-badge" title="TongFlow studio session">
            🎬 Studio
        </span>
    );
}
