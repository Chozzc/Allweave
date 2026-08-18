import "./studio.css";
import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectSummary, TakeInfo, TreeNode } from "../../shared/types.ts";
import { studio } from "../api.ts";
import { ChatPane } from "./ChatPane.tsx";
import { Modal, useAsync } from "./common.tsx";
import { InspectorPane } from "./InspectorPane.tsx";
import { PluginsDialog } from "./PluginsDialog.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { TreePane } from "./TreePane.tsx";

/** Host-provided actions injected at registration time. */
export interface StudioInjected {
    /** Register the project folder as a dsh workspace and open a session in it. */
    openWorkspace: (path: string) => Promise<void>;
    locale: string;
}

/**
 * Works both as the conversation "Studio" tab (session kit present → a chat
 * column is shown) and inside the sidebar launcher's overlay (no session).
 */
export type StudioViewProps = Pick<
    PropsRuntime<"sidebar.footer.action">,
    "useSessions"
> &
    Partial<
        Pick<
            PropsRuntime<"conversation.view">,
            "useSession" | "inputActions" | "useInput" | "sessionId"
        >
    > &
    StudioInjected & { onClose?: () => void };

const LS_KEY = "dsh-tongflow:project";

export function StudioView(props: StudioViewProps) {
    const { openWorkspace, locale, useSessions, onClose } = props;
    const hasChat = Boolean(
        props.useSession &&
            props.inputActions &&
            props.useInput &&
            props.sessionId,
    );
    const cwd = useSessions((s) => {
        const id = props.sessionId ?? s.current;
        return id ? s.byId[id]?.cwd : undefined;
    });
    const projects = useAsync(() => studio.projects(), []);
    const health = useAsync(() => studio.health(), []);
    const [pid, setPid] = useState<string | undefined>(
        () => localStorage.getItem(LS_KEY) ?? undefined,
    );
    const [selected, setSelected] = useState<TreeNode | undefined>();
    const [selectedTake, setSelectedTake] = useState<TakeInfo | undefined>();
    const [refresh, setRefresh] = useState(0);
    const [dialog, setDialog] = useState<"new" | "plugins" | undefined>();
    const bump = useCallback(() => setRefresh((n) => n + 1), []);

    // Sync dark mode for the embedded canvas (dsh marks dark on body[data-ds-dark-theme]).
    useEffect(() => {
        const apply = () => {
            const dark = document.body.hasAttribute("data-ds-dark-theme");
            document.documentElement.classList.toggle("dark", dark);
        };
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(document.body, {
            attributes: true,
            attributeFilter: ["data-ds-dark-theme"],
        });
        return () => obs.disconnect();
    }, []);

    // Follow the session's workspace when it is a studio project.
    useEffect(() => {
        if (!cwd || !projects.data) return;
        const match = projects.data.find(
            (p) => cwd === p.root || cwd.startsWith(`${p.root}/`),
        );
        if (match && match.id !== pid) setPid(match.id);
    }, [cwd, projects.data]);
    useEffect(() => {
        if (pid) localStorage.setItem(LS_KEY, pid);
    }, [pid]);
    // Fall back to the most recent project.
    useEffect(() => {
        if (!pid && projects.data && projects.data.length > 0)
            setPid(projects.data[0].id);
    }, [projects.data, pid]);

    const project = useMemo(
        () => projects.data?.find((p) => p.id === pid),
        [projects.data, pid],
    );
    const tree = useAsync(
        () => (pid ? studio.tree(pid) : Promise.resolve([] as TreeNode[])),
        [pid, refresh],
    );
    // Poll the tree while the tab is visible so agent-made changes show up.
    useEffect(() => {
        const t = setInterval(() => {
            if (document.visibilityState === "visible") tree.reload();
        }, 6000);
        return () => clearInterval(t);
    }, [tree.reload]);

    const onSelect = (n: TreeNode) => {
        setSelected(n);
        setSelectedTake(undefined);
    };

    return (
        <div className="tfs-root">
            <div className="tfs-header">
                <h1>TongFlow Studio</h1>
                <select
                    className="tfs-select"
                    value={pid ?? ""}
                    onChange={(e) => {
                        setPid(e.target.value || undefined);
                        setSelected(undefined);
                        setSelectedTake(undefined);
                    }}
                >
                    {!projects.data?.length ? (
                        <option value="">no projects</option>
                    ) : null}
                    {(projects.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.title} · {p.id}
                        </option>
                    ))}
                </select>
                <button
                    className="tfs-btn small"
                    onClick={() => setDialog("new")}
                >
                    + New project
                </button>
                {project ? (
                    <button
                        className="tfs-btn small"
                        title={project.root}
                        onClick={() => openWorkspace(project.root)}
                    >
                        Open in session
                    </button>
                ) : null}
                <span className="tfs-spacer" />
                {health.data && !health.data.ok ? (
                    <span className="tfs-error" title={health.data.error}>
                        engine not ready
                    </span>
                ) : null}
                <button
                    className="tfs-btn small"
                    onClick={bump}
                    title="refresh"
                >
                    ↻
                </button>
                <button
                    className="tfs-btn small"
                    onClick={() => setDialog("plugins")}
                >
                    Plugins & keys
                </button>
                {onClose ? (
                    <button
                        className="tfs-btn small"
                        onClick={onClose}
                        title="close"
                    >
                        ✕
                    </button>
                ) : null}
            </div>
            <div className={`tfs-body${hasChat ? " with-chat" : ""}`}>
                {hasChat ? (
                    <div className="tfs-pane">
                        <ChatPane
                            useSession={props.useSession!}
                            inputActions={props.inputActions!}
                            useInput={props.useInput!}
                            sessionId={props.sessionId!}
                        />
                    </div>
                ) : null}
                <div className="tfs-pane">
                    {tree.error ? (
                        <div className="tfs-error" style={{ padding: 10 }}>
                            {tree.error}
                        </div>
                    ) : null}
                    {pid && tree.data ? (
                        <TreePane
                            tree={tree.data}
                            selectedId={selected?.id}
                            onSelect={onSelect}
                        />
                    ) : (
                        <div className="tfs-empty">
                            Create a project to start.
                        </div>
                    )}
                </div>
                <div className="tfs-pane">
                    {pid ? (
                        <PreviewPane
                            pid={pid}
                            node={selected}
                            locale={locale}
                            refreshToken={refresh}
                            selectedTake={selectedTake}
                            onSelectTake={setSelectedTake}
                            onChanged={bump}
                            onCanvasSave={(s) => {
                                if (s === "saved") tree.reload();
                            }}
                        />
                    ) : (
                        <div className="tfs-empty">
                            <p>No project yet.</p>
                            <button
                                className="tfs-btn primary"
                                onClick={() => setDialog("new")}
                            >
                                Create a project
                            </button>
                        </div>
                    )}
                </div>
                <div className="tfs-pane">
                    {pid ? (
                        <InspectorPane
                            pid={pid}
                            node={selected}
                            selectedTake={selectedTake}
                            refreshToken={refresh}
                            onChanged={bump}
                            onOpenTake={(t) => {
                                setSelected({
                                    id: t.key,
                                    label: t.fileName,
                                    kind: "file",
                                    key: t.key,
                                });
                            }}
                        />
                    ) : null}
                </div>
            </div>
            {dialog === "new" ? (
                <NewProjectDialog
                    onClose={() => setDialog(undefined)}
                    onCreated={async (p) => {
                        setDialog(undefined);
                        projects.reload();
                        setPid(p.id);
                        setSelected(undefined);
                        await openWorkspace(p.root).catch(() => undefined);
                    }}
                />
            ) : null}
            {dialog === "plugins" ? (
                <PluginsDialog onClose={() => setDialog(undefined)} />
            ) : null}
        </div>
    );
}

function NewProjectDialog({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: (p: ProjectSummary) => void;
}) {
    const templates = useAsync(() => studio.templates(), []);
    const [title, setTitle] = useState("");
    const [template, setTemplate] = useState("");
    const [logline, setLogline] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    useEffect(() => {
        if (!template && templates.data?.[0]) setTemplate(templates.data[0].id);
    }, [templates.data, template]);
    return (
        <Modal title="New project" onClose={onClose}>
            <div className="tfs-form">
                <div>
                    <div className="tfs-label">Title</div>
                    <input
                        className="tfs-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Rooftop Rain"
                    />
                </div>
                <div>
                    <div className="tfs-label">Template</div>
                    <br />
                    <select
                        className="tfs-select"
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                    >
                        {(templates.data ?? []).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="tfs-muted" style={{ marginTop: 4 }}>
                        {
                            templates.data?.find((t) => t.id === template)
                                ?.description
                        }
                    </div>
                </div>
                <div>
                    <div className="tfs-label">Logline</div>
                    <input
                        className="tfs-input"
                        value={logline}
                        onChange={(e) => setLogline(e.target.value)}
                        placeholder="One sentence"
                    />
                </div>
                {err ? <div className="tfs-error">{err}</div> : null}
                <div className="tfs-row">
                    <button
                        className="tfs-btn primary"
                        disabled={!title.trim() || !template || busy}
                        onClick={async () => {
                            setBusy(true);
                            setErr(undefined);
                            try {
                                const p = await studio.createProject({
                                    title: title.trim(),
                                    template,
                                    ...(logline.trim()
                                        ? { logline: logline.trim() }
                                        : {}),
                                });
                                onCreated(p);
                            } catch (e) {
                                setErr(
                                    e instanceof Error ? e.message : String(e),
                                );
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        Create
                    </button>
                    <button className="tfs-btn" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </Modal>
    );
}
