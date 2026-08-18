import "./studio.css";
import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary, TakeInfo, TreeNode } from "../../shared/types.ts";
import { studio } from "../api.ts";
import { makeT } from "../i18n.ts";
import { ChatPane } from "./ChatPane.tsx";
import { Drawer, Modal, TContext, useAsync, useT } from "./common.tsx";
import {
    RecentRuns,
    RunPanel,
    TakeCard,
    useActiveRuns,
} from "./InspectorPane.tsx";
import { PluginsDialog } from "./PluginsDialog.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { TreePane } from "./TreePane.tsx";

/** Host-provided actions injected at registration time. */
export interface StudioInjected {
    /** Register the project folder as a dsh workspace and open a session in it. */
    openWorkspace: (path: string) => Promise<void>;
    locale: string;
}

/** The Studio as the session's conversation view (session kit present → chat column shown). */
export type StudioViewProps = Pick<
    PropsRuntime<"conversation.view">,
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

type DrawerState =
    | { kind: "take"; take: TakeInfo }
    | { kind: "run"; workflowKey: string }
    | { kind: "runs" }
    | undefined;

export function StudioView(props: StudioViewProps) {
    const t = useMemo(() => makeT(props.locale), [props.locale]);
    return (
        <TContext.Provider value={t}>
            <StudioBody {...props} />
        </TContext.Provider>
    );
}

/**
 * dsh's view area grows with content (flex: 1 0 auto inside a scrolling
 * body); the studio wants a fixed frame with internally scrolling panes, so
 * it sizes itself to the nearest scrolling ancestor's viewport.
 */
function useFillScrollport(
    ref: React.RefObject<HTMLDivElement | null>,
): number | undefined {
    const [height, setHeight] = useState<number | undefined>();
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let scroller: HTMLElement | null = el.parentElement;
        while (
            scroller &&
            !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
        )
            scroller = scroller.parentElement;
        if (!scroller) return;
        const target = scroller;
        // dsh floats its composer over the bottom of the scroll body; stop above it.
        const composer = () =>
            target.parentElement?.querySelector<HTMLElement>(
                '[class*="composerStack"]',
            ) ?? undefined;
        const apply = () => {
            const bar = composer();
            const top = target.getBoundingClientRect().top;
            const bottom = bar
                ? bar.getBoundingClientRect().top
                : target.getBoundingClientRect().bottom;
            const h = Math.max(240, Math.floor(bottom - top));
            setHeight(h);
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(target);
        const bar = composer();
        if (bar) ro.observe(bar);
        window.addEventListener("resize", apply);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", apply);
        };
    }, [ref]);
    return height;
}

function StudioBody(props: StudioViewProps) {
    const t = useT();
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
    const rootRef = useRef<HTMLDivElement>(null);
    const fillHeight = useFillScrollport(rootRef);
    const projects = useAsync(() => studio.projects(), []);
    const health = useAsync(() => studio.health(), []);
    const [pid, setPid] = useState<string | undefined>(
        () => localStorage.getItem(LS_KEY) ?? undefined,
    );
    const [selected, setSelected] = useState<TreeNode | undefined>();
    const [drawer, setDrawer] = useState<DrawerState>(undefined);
    const [refresh, setRefresh] = useState(0);
    const [dialog, setDialog] = useState<"new" | "plugins" | undefined>();
    const bump = useCallback(() => setRefresh((n) => n + 1), []);

    // Sync dark mode for the embedded canvas (dsh marks dark on body[data-ds-dark-theme]).
    useEffect(() => {
        const apply = () =>
            document.documentElement.classList.toggle(
                "dark",
                document.body.hasAttribute("data-ds-dark-theme"),
            );
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
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") tree.reload();
        }, 6000);
        return () => clearInterval(timer);
    }, [tree.reload]);
    const activeRuns = useActiveRuns(pid ?? "", refresh);

    // Follow the project the session's agent is working in (its tool calls set it).
    const sessionId = props.sessionId;
    useEffect(() => {
        if (!sessionId) return;
        let alive = true;
        const check = () =>
            studio
                .sessionProject(sessionId)
                .then((r) => {
                    if (!alive || !r.project) return;
                    setPid((cur) => {
                        if (cur === r.project) return cur;
                        setSelected(undefined);
                        setDrawer(undefined);
                        projects.reload();
                        return r.project ?? cur;
                    });
                })
                .catch(() => undefined);
        check();
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") check();
        }, 3000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [sessionId, projects.reload]);

    const onSelect = (n: TreeNode) => {
        setSelected(n);
        if (drawer?.kind === "take") setDrawer(undefined);
    };
    const selectedTake = drawer?.kind === "take" ? drawer.take : undefined;

    return (
        <div
            className="tfs-root"
            ref={rootRef}
            style={fillHeight ? { height: fillHeight } : undefined}
        >
            <div className="tfs-header">
                <h1>{t("studio")}</h1>
                <select
                    className="tfs-select"
                    value={pid ?? ""}
                    onChange={(e) => {
                        setPid(e.target.value || undefined);
                        setSelected(undefined);
                        setDrawer(undefined);
                    }}
                >
                    {!projects.data?.length ? (
                        <option value="">{t("noProjects")}</option>
                    ) : null}
                    {(projects.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.title} · {p.id}
                        </option>
                    ))}
                </select>
                <button className="tfs-btn" onClick={() => setDialog("new")}>
                    {t("newProject")}
                </button>
                {project ? (
                    <button
                        className="tfs-btn"
                        title={project.root}
                        onClick={() => openWorkspace(project.root)}
                    >
                        {t("openInSession")}
                    </button>
                ) : null}
                <span className="tfs-spacer" />
                {health.data && !health.data.ok ? (
                    <span className="tfs-error" title={health.data.error}>
                        {t("engineNotReady")}
                    </span>
                ) : null}
                {pid ? (
                    <button
                        className={`tfs-btn${activeRuns ? " busy" : ""}`}
                        onClick={() =>
                            setDrawer((d) =>
                                d?.kind === "runs"
                                    ? undefined
                                    : { kind: "runs" },
                            )
                        }
                    >
                        {activeRuns
                            ? `● ${t("runs")} (${activeRuns})`
                            : t("runs")}
                    </button>
                ) : null}
                <button className="tfs-btn" onClick={bump} title={t("refresh")}>
                    ↻
                </button>
                <button
                    className="tfs-btn"
                    onClick={() => setDialog("plugins")}
                >
                    {t("pluginsKeys")}
                </button>
                {onClose ? (
                    <button
                        className="tfs-btn"
                        onClick={onClose}
                        title={t("close")}
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
                        <div className="tfs-empty">{t("createToStart")}</div>
                    )}
                </div>
                <div className="tfs-pane tfs-main">
                    {pid ? (
                        <PreviewPane
                            pid={pid}
                            node={selected}
                            locale={locale}
                            refreshToken={refresh}
                            selectedTake={selectedTake}
                            onSelectTake={(tk) =>
                                setDrawer(
                                    tk ? { kind: "take", take: tk } : undefined,
                                )
                            }
                            onChanged={bump}
                            onCanvasSave={(s) => {
                                if (s === "saved") tree.reload();
                            }}
                            onRun={(key) =>
                                setDrawer({ kind: "run", workflowKey: key })
                            }
                        />
                    ) : (
                        <div className="tfs-empty">
                            <p>{t("noProjectYet")}</p>
                            <button
                                className="tfs-btn primary"
                                onClick={() => setDialog("new")}
                            >
                                {t("createProject")}
                            </button>
                        </div>
                    )}
                    {pid && drawer ? (
                        <Drawer
                            title={
                                drawer.kind === "take"
                                    ? `${t("take")} · ${drawer.take.owner}/${drawer.take.pass}/${drawer.take.take}`
                                    : drawer.kind === "run"
                                      ? t("run").replace("▶ ", "")
                                      : t("runs")
                            }
                            onClose={() => setDrawer(undefined)}
                        >
                            {drawer.kind === "take" ? (
                                <TakeCard
                                    pid={pid}
                                    take={drawer.take}
                                    onChanged={() => {
                                        bump();
                                        setDrawer(undefined);
                                    }}
                                    onOpenTake={(tk) => {
                                        setSelected({
                                            id: tk.key,
                                            label: tk.fileName,
                                            kind: "file",
                                            key: tk.key,
                                        });
                                        setDrawer(undefined);
                                    }}
                                    onOpenWorkflow={(key) => {
                                        setSelected({
                                            id: key,
                                            label: key.replace(
                                                /^workflows\//,
                                                "",
                                            ),
                                            kind: "workflow",
                                            key,
                                        });
                                        setDrawer(undefined);
                                    }}
                                />
                            ) : drawer.kind === "run" ? (
                                <RunPanel
                                    pid={pid}
                                    workflowKey={drawer.workflowKey}
                                    refreshToken={refresh}
                                    onChanged={bump}
                                />
                            ) : (
                                <RecentRuns
                                    pid={pid}
                                    refreshToken={refresh}
                                    onChanged={bump}
                                />
                            )}
                        </Drawer>
                    ) : null}
                </div>
            </div>
            {dialog === "new" ? (
                <NewProjectDialog
                    locale={locale}
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
    locale,
    onClose,
    onCreated,
}: {
    locale: string;
    onClose: () => void;
    onCreated: (p: ProjectSummary) => void;
}) {
    const t = useT();
    const templates = useAsync(() => studio.templates(), []);
    const [title, setTitle] = useState("");
    const [template, setTemplate] = useState("");
    const [logline, setLogline] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    useEffect(() => {
        if (!template && templates.data?.[0]) setTemplate(templates.data[0].id);
    }, [templates.data, template]);
    const tpl = templates.data?.find((x) => x.id === template);
    return (
        <Modal title={t("newProjectTitle")} onClose={onClose}>
            <div className="tfs-form">
                <div>
                    <div className="tfs-label">{t("title")}</div>
                    <input
                        className="tfs-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Rooftop Rain"
                    />
                </div>
                <div>
                    <div className="tfs-label">{t("template")}</div>
                    <select
                        className="tfs-select"
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                    >
                        {(templates.data ?? []).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.title}
                            </option>
                        ))}
                    </select>
                    <div className="tfs-muted" style={{ marginTop: 4 }}>
                        {tpl?.description}
                    </div>
                </div>
                <div>
                    <div className="tfs-label">{t("logline")}</div>
                    <input
                        className="tfs-input"
                        value={logline}
                        onChange={(e) => setLogline(e.target.value)}
                        placeholder={t("oneSentence")}
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
                                    locale,
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
                        {t("create")}
                    </button>
                    <button className="tfs-btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
