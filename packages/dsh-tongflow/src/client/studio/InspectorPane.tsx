import { useEffect, useMemo, useRef, useState } from "react";
import type { Pass, RunEvent, RunSummary, TakeInfo, TreeNode, WorkflowSummary } from "../../shared/types.ts";
import { fileUrl, studio, subscribeRun } from "../api.ts";
import { fmtBytes, fmtTime, useAsync } from "./common.tsx";

export interface InspectorProps {
    pid: string;
    node: TreeNode | undefined;
    selectedTake: TakeInfo | undefined;
    refreshToken: number;
    onChanged: () => void;
    onOpenTake: (take: TakeInfo) => void;
}

export function InspectorPane(p: InspectorProps) {
    return (
        <div className="tfs-inspector">
            {p.selectedTake ? <TakeCard {...p} take={p.selectedTake} /> : null}
            {p.node?.kind === "workflow" ? <RunPanel {...p} workflowKey={p.node.key ?? p.node.id} /> : null}
            <RecentRuns pid={p.pid} refreshToken={p.refreshToken} onChanged={p.onChanged} />
        </div>
    );
}

/* ---------------- take card ---------------- */

function TakeCard({ pid, take, onChanged, onOpenTake }: InspectorProps & { take: TakeInfo }) {
    const prov = take.provenance;
    return (
        <div className="tfs-card">
            <h3>
                {take.owner} / {take.pass} / {take.take} {take.circled ? <span style={{ color: "var(--tfs-ok)" }}>● circled</span> : null}
            </h3>
            <dl className="tfs-kv">
                <dt>file</dt>
                <dd>
                    <a href={fileUrl(pid, take.key)} target="_blank" rel="noreferrer">
                        {take.fileName}
                    </a>{" "}
                    <span className="tfs-muted">{fmtBytes(take.size)}</span>
                </dd>
                <dt>ref</dt>
                <dd>
                    tf://{take.owner}/{take.pass}/{take.take}
                </dd>
                <dt>made</dt>
                <dd>{fmtTime(take.mtime)}</dd>
                {prov ? (
                    <>
                        <dt>workflow</dt>
                        <dd>
                            {prov.workflow} <span className="tfs-muted">#{prov.workflowHash.slice(0, 8)}</span>
                        </dd>
                        <dt>plugins</dt>
                        <dd>{prov.pluginIds.join(", ")}</dd>
                        <dt>bindings</dt>
                        <dd>
                            {Object.entries(prov.bindings).map(([k, v]) => (
                                <div key={k}>
                                    <b>{k}</b> = {Array.isArray(v) ? v.join(", ") : v}
                                </div>
                            ))}
                        </dd>
                        <dt>took</dt>
                        <dd>{(prov.durationMs / 1000).toFixed(1)} s</dd>
                        {prov.note ? (
                            <>
                                <dt>note</dt>
                                <dd>{prov.note}</dd>
                            </>
                        ) : null}
                    </>
                ) : null}
            </dl>
            <div className="tfs-row" style={{ marginTop: 8 }}>
                {!take.circled ? (
                    <button
                        className="tfs-btn small primary"
                        onClick={async () => {
                            await studio.circle(pid, take.owner, take.pass, take.take);
                            onChanged();
                        }}
                    >
                        Circle this take
                    </button>
                ) : null}
                <button className="tfs-btn small" onClick={() => onOpenTake(take)}>
                    Preview
                </button>
                <button
                    className="tfs-btn small danger"
                    onClick={async () => {
                        if (!confirm(`Delete ${take.fileName}?`)) return;
                        await studio.deleteTake(pid, take.owner, take.pass, take.take);
                        onChanged();
                    }}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

/* ---------------- run panel ---------------- */

const PASSES: Pass[] = ["REF", "VO", "SB", "KF", "ANI", "DLG", "MUS", "SFX", "MIX", "CUT"];

function RunPanel({ pid, workflowKey, refreshToken, onChanged }: InspectorProps & { workflowKey: string }) {
    const { data: summary, error, reload } = useAsync(() => studio.workflows(pid).then((ws) => ws.find((w) => w.key === workflowKey || w.key === `workflows/${workflowKey}`)), [pid, workflowKey, refreshToken]);
    const [bindings, setBindings] = useState<Record<string, string>>({});
    const [owner, setOwner] = useState("");
    const [pass, setPass] = useState<Pass | "">("");
    const [note, setNote] = useState("");
    const [run, setRun] = useState<RunSummary | undefined>();
    const [log, setLog] = useState<string[]>([]);
    const unsub = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        if (!summary) return;
        const next: Record<string, string> = {};
        for (const i of summary.inputs) next[i.name] = Array.isArray(i.bound) ? i.bound.join(", ") : (i.bound ?? "");
        setBindings(next);
        setOwner(summary.meta.target?.owner ?? "");
        setPass(summary.meta.target?.pass ?? "");
    }, [summary]);
    useEffect(() => () => unsub.current?.(), []);
    const start = async () => {
        if (!summary) return;
        setLog([]);
        const inputs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(bindings)) if (v.trim()) inputs[k] = v.includes(", ") ? v.split(", ").map((s) => s.trim()) : v.trim();
        try {
            const s = await studio.startRun(pid, {
                workflowKey: summary.key,
                inputs,
                ...(owner && pass ? { target: { owner, pass } } : {}),
                ...(note ? { note } : {}),
            });
            setRun(s);
            unsub.current?.();
            unsub.current = subscribeRun(
                s.runId,
                ({ event, summary: sum }) => {
                    setRun({ ...sum });
                    const line = describeEvent(event);
                    if (line) setLog((l) => [...l.slice(-200), line]);
                    if (event.type === "ingested" || event.type === "error") onChanged();
                },
                () => onChanged(),
            );
        } catch (e) {
            setLog([`✗ ${e instanceof Error ? e.message : String(e)}`]);
        }
    };
    if (error) return <div className="tfs-card tfs-error">{error}</div>;
    if (!summary) return <div className="tfs-card tfs-muted">…</div>;
    return (
        <div className="tfs-card">
            <h3>Run · {summary.name}</h3>
            {summary.inputs.length === 0 ? <div className="tfs-muted">no inputs (static graph)</div> : null}
            <div className="tfs-form">
                {summary.inputs.map((i) => (
                    <div key={i.name}>
                        <label>
                            {i.name} <span className="tfs-muted">({i.type}{i.required ? ", required" : ""})</span>
                        </label>
                        <input className="tfs-input" placeholder="tf://CHR_MEI/REF · project key · text" value={bindings[i.name] ?? ""} onChange={(e) => setBindings({ ...bindings, [i.name]: e.target.value })} />
                    </div>
                ))}
                <div className="tfs-row">
                    <div style={{ flex: 1 }}>
                        <label>target owner</label>
                        <input className="tfs-input" placeholder="CHR_MEI · EP01_SC001_SH0010 · EP01" value={owner} onChange={(e) => setOwner(e.target.value.trim())} />
                    </div>
                    <div>
                        <label>pass</label>
                        <br />
                        <select className="tfs-select" value={pass} onChange={(e) => setPass(e.target.value as Pass)}>
                            <option value="">—</option>
                            {PASSES.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label>note</label>
                    <input className="tfs-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="what changed / why" />
                </div>
                <div className="tfs-row">
                    <button className="tfs-btn primary" onClick={start} disabled={run?.status === "running" || run?.status === "queued"}>
                        ▶ Run
                    </button>
                    {run && (run.status === "running" || run.status === "queued") ? (
                        <button className="tfs-btn" onClick={() => studio.cancelRun(run.runId)}>
                            Cancel
                        </button>
                    ) : null}
                    <button
                        className="tfs-btn small"
                        onClick={async () => {
                            const b: Record<string, string> = {};
                            for (const [k, v] of Object.entries(bindings)) if (v.trim()) b[k] = v.trim();
                            await studio.bindWorkflow(pid, summary.key, { bindings: b, ...(owner && pass ? { target: { owner, pass } } : {}) });
                            reload();
                            onChanged();
                        }}
                    >
                        Save as defaults
                    </button>
                    {run ? <span className={`tfs-status ${run.status}`}>{run.status}</span> : null}
                </div>
            </div>
            {run ? <RunNodes run={run} /> : null}
            {log.length > 0 ? <div className="tfs-log" style={{ marginTop: 8 }}>{log.join("\n")}</div> : null}
            {run?.takes.length ? (
                <div style={{ marginTop: 6 }}>
                    ★ takes: {run.takes.map((t) => `${t.owner}/${t.pass}/${t.take}`).join(", ")}
                </div>
            ) : null}
        </div>
    );
}

function RunNodes({ run }: { run: RunSummary }) {
    const entries = Object.entries(run.nodes);
    if (entries.length === 0) return null;
    return (
        <div style={{ marginTop: 6, fontSize: 12 }}>
            {entries.map(([id, n]) => (
                <div key={id} className="tfs-row">
                    <span className={`tfs-status ${n.status}`}>{n.status}</span>
                    <span>{n.label ?? id.slice(0, 8)}</span>
                    {n.percent !== undefined ? <span className="tfs-muted">{Math.round(n.percent)}%</span> : null}
                    {n.message ? <span className="tfs-muted">{n.message}</span> : null}
                </div>
            ))}
        </div>
    );
}

export function describeEvent(e: RunEvent): string {
    switch (e.type) {
        case "log":
            return e.message ? `· ${e.message}` : "";
        case "workflow_started":
            return `▶ started (${e.totalNodes ?? "?"} nodes)`;
        case "node_started":
            return `▶ ${e.label ?? e.nodeId ?? ""}`;
        case "plugin_progress":
            return `… ${e.message ?? ""}${e.percent !== undefined ? ` ${Math.round(e.percent)}%` : ""}`;
        case "node_completed":
            return `✓ ${e.label ?? e.nodeId ?? ""}`;
        case "node_failed":
            return `✗ ${e.label ?? e.nodeId ?? ""}: ${e.error ?? ""}`;
        case "workflow_completed":
            return "✓ workflow completed";
        case "workflow_failed":
            return `✗ workflow failed: ${e.error ?? ""}`;
        case "ingested":
            return e.takes && e.takes.length ? `★ ${e.takes.map((t) => `${t.owner}/${t.pass}/${t.take}`).join(", ")}` : "";
        case "error":
            return `✗ ${e.error ?? ""}`;
        default:
            return "";
    }
}

/* ---------------- recent runs ---------------- */

function RecentRuns({ pid, refreshToken, onChanged }: { pid: string; refreshToken: number; onChanged: () => void }) {
    const { data, reload } = useAsync(() => studio.runs(pid), [pid, refreshToken]);
    const live = useMemo(() => (data ?? []).some((r) => r.status === "running" || r.status === "queued"), [data]);
    useEffect(() => {
        if (!live) return;
        const t = setInterval(reload, 2500);
        return () => clearInterval(t);
    }, [live, reload]);
    if (!data || data.length === 0) return null;
    return (
        <div className="tfs-card">
            <h3>Recent runs</h3>
            {data.slice(0, 8).map((r) => (
                <div key={r.runId} className="tfs-row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }} title={r.workflow}>
                        {r.workflow.replace(/^workflows\//, "")}
                    </span>
                    <span className="tfs-row">
                        {r.target ? <span className="tfs-muted">{r.target.owner}/{r.target.pass}</span> : null}
                        <span className={`tfs-status ${r.status}`}>{r.status}</span>
                        {r.status === "running" || r.status === "queued" ? (
                            <button className="tfs-btn small" onClick={() => studio.cancelRun(r.runId).then(onChanged)}>
                                ✕
                            </button>
                        ) : null}
                    </span>
                </div>
            ))}
        </div>
    );
}

export type { WorkflowSummary };
