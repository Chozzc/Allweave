import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type StudioInjected, StudioView } from "./StudioView.tsx";

export type StudioLauncherProps = PropsRuntime<"sidebar.footer.action"> &
    StudioInjected;

/** Sidebar footer button that opens the Studio as a frame-wide overlay (works with or without a session). */
export function StudioLauncher(props: StudioLauncherProps) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);
    return (
        <>
            <button
                type="button"
                className="tfs-launch"
                title="TongFlow Studio"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                <span className="tfs-launch-icon">🎬</span>
                {props.wide ? (
                    <span className="tfs-launch-label">Studio</span>
                ) : null}
            </button>
            {open
                ? createPortal(
                      <div className="tfs-overlay">
                          <StudioView
                              useSessions={props.useSessions}
                              openWorkspace={props.openWorkspace}
                              locale={props.locale}
                              onClose={() => setOpen(false)}
                          />
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
