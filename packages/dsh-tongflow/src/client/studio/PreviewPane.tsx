import { useEffect, useState } from "react";
import type {
    EntityDetail,
    EpisodeBreakdown,
    Pass,
    TakeInfo,
    TreeNode,
} from "../../shared/types.ts";
import { modalityOfExt } from "../../shared/types.ts";
import { fileUrl, studio } from "../api.ts";
import { CanvasPane } from "./CanvasPane.tsx";
import { Modal, passLabel, TakesGrid, useAsync, useT } from "./common.tsx";

export interface PreviewProps {
    pid: string;
    node: TreeNode | undefined;
    locale: string;
    refreshToken: number;
    selectedTake?: TakeInfo;
    onSelectTake: (t: TakeInfo | undefined) => void;
    onChanged: () => void;
    onCanvasSave: (
        state: "saving" | "saved" | "error",
        detail?: string,
    ) => void;
    /** Open the run drawer for the current workflow. */
    onRun: (workflowKey: string) => void;
}

export function PreviewPane(p: PreviewProps) {
    const t = useT();
    const { node } = p;
    if (!node) return <div className="tfs-empty">{t("selectHint")}</div>;
    switch (node.kind) {
        case "entity":
            return <EntityView key={node.id} {...p} entityId={node.id} />;
        case "shot":
            return <ShotView key={node.id} {...p} shotId={node.id} />;
        case "episode":
            return <EpisodeView key={node.id} {...p} episode={node.id} />;
        case "workflow":
            return (
                <WorkflowView
                    key={node.key ?? node.id}
                    {...p}
                    workflowKey={node.key ?? node.id}
                />
            );
        case "file":
            return (
                <FileView
                    key={node.key ?? node.id}
                    {...p}
                    fileKey={node.key ?? node.id}
                />
            );
        case "folder":
            if (node.meta?.owner && node.meta?.pass)
                return (
                    <PassView
                        key={node.id}
                        {...p}
                        owner={String(node.meta.owner)}
                        pass={node.meta.pass as Pass}
                    />
                );
            return <div className="tfs-empty">{node.label}</div>;
        default:
            return <div className="tfs-empty">{node.label}</div>;
    }
}

/* ---------------- entity ---------------- */

function EntityView({
    pid,
    entityId,
    refreshToken,
    selectedTake,
    onSelectTake,
    onChanged,
}: PreviewProps & { entityId: string }) {
    const t = useT();
    const { data, error, reload } = useAsync(
        () => studio.entity(pid, entityId),
        [pid, entityId, refreshToken],
    );
    const takes = useAsync(
        () => studio.takes(pid, entityId),
        [pid, entityId, refreshToken],
    );
    const [editing, setEditing] = useState<
        { card: string; consistency: string } | undefined
    >();
    if (error) return <div className="tfs-empty tfs-error">{error}</div>;
    if (!data) return <div className="tfs-empty">…</div>;
    const save = async () => {
        if (!editing) return;
        let consistency: Record<string, unknown>;
        try {
            consistency = JSON.parse(editing.consistency || "{}");
        } catch {
            alert("consistency.json is not valid JSON");
            return;
        }
        const patch: Record<string, unknown> = { ...consistency };
        for (const k of Object.keys(data.consistency))
            if (!(k in consistency)) patch[k] = null;
        await studio.upsertEntity(pid, entityId, {
            card: editing.card,
            consistency: patch,
        });
        setEditing(undefined);
        reload();
        onChanged();
    };
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>
                    {data.name}{" "}
                    <span className="tfs-muted">
                        {data.id} · {data.kind}
                    </span>
                </h2>
                <span className="tfs-spacer" />
                {editing ? (
                    <>
                        <button
                            className="tfs-btn small primary"
                            onClick={save}
                        >
                            {t("save")}
                        </button>
                        <button
                            className="tfs-btn small"
                            onClick={() => setEditing(undefined)}
                        >
                            {t("cancel")}
                        </button>
                    </>
                ) : (
                    <button
                        className="tfs-btn small"
                        onClick={() =>
                            setEditing({
                                card: data.card,
                                consistency: JSON.stringify(
                                    data.consistency,
                                    null,
                                    2,
                                ),
                            })
                        }
                    >
                        {t("edit")}
                    </button>
                )}
            </div>
            <div className="tfs-preview-body">
                <div className="tfs-two-col">
                    <div className="tfs-card">
                        <h3>card.md</h3>
                        {editing ? (
                            <textarea
                                className="tfs-textarea"
                                style={{ minHeight: 220 }}
                                value={editing.card}
                                onChange={(e) =>
                                    setEditing({
                                        ...editing,
                                        card: e.target.value,
                                    })
                                }
                            />
                        ) : (
                            <div className="tfs-md">
                                {data.card || "(empty)"}
                            </div>
                        )}
                    </div>
                    <div className="tfs-card">
                        <h3>consistency.json</h3>
                        {editing ? (
                            <textarea
                                className="tfs-textarea"
                                style={{ minHeight: 220 }}
                                value={editing.consistency}
                                onChange={(e) =>
                                    setEditing({
                                        ...editing,
                                        consistency: e.target.value,
                                    })
                                }
                            />
                        ) : (
                            <ConsistencyKit kit={data as EntityDetail} />
                        )}
                    </div>
                </div>
                {(["REF", "VO"] as Pass[]).map((pass) => (
                    <div className="tfs-card" key={pass}>
                        <h3>
                            {pass} · {passLabel(t, pass)}{" "}
                            <span className="tfs-muted">
                                tf://{entityId}/{pass}
                            </span>
                        </h3>
                        <TakesGrid
                            pid={pid}
                            takes={takes.data?.[pass] ?? []}
                            selected={selectedTake}
                            onSelect={onSelectTake}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function ConsistencyKit({ kit }: { kit: EntityDetail }) {
    const t = useT();
    const entries = Object.entries(kit.consistency).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
    );
    if (entries.length === 0)
        return <div className="tfs-muted">{t("kitEmpty")}</div>;
    return (
        <dl className="tfs-kv">
            {entries.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                </div>
            ))}
        </dl>
    );
}

/* ---------------- shot ---------------- */

function ShotView({
    pid,
    shotId,
    node,
    refreshToken,
    selectedTake,
    onSelectTake,
}: PreviewProps & { shotId: string }) {
    const t = useT();
    const takes = useAsync(
        () => studio.takes(pid, shotId),
        [pid, shotId, refreshToken],
    );
    const bd = (node?.meta?.breakdown ?? {}) as Record<string, unknown>;
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>
                    {shotId}{" "}
                    <span className="tfs-muted">
                        {String(bd.size ?? "")} {String(bd.camera ?? "")}
                    </span>
                </h2>
            </div>
            <div className="tfs-preview-body">
                <div className="tfs-card">
                    <h3>{t("breakdown")}</h3>
                    <dl className="tfs-kv">
                        {(
                            [
                                "duration",
                                "characters",
                                "props",
                                "action",
                                "notes",
                            ] as const
                        ).map((k) =>
                            bd[k] !== undefined ? (
                                <div key={k} style={{ display: "contents" }}>
                                    <dt>{k}</dt>
                                    <dd>
                                        {Array.isArray(bd[k])
                                            ? (bd[k] as string[]).join(", ")
                                            : String(bd[k])}
                                    </dd>
                                </div>
                            ) : null,
                        )}
                        {Array.isArray(bd.dialogue)
                            ? (
                                  bd.dialogue as {
                                      character: string;
                                      line: string;
                                      direction?: string;
                                  }[]
                              ).map((d, i) => (
                                  <div key={i} style={{ display: "contents" }}>
                                      <dt>
                                          {t("dialogue")}/{i + 1}
                                      </dt>
                                      <dd>
                                          <b>{d.character}</b>: {d.line}{" "}
                                          {d.direction ? (
                                              <span className="tfs-muted">
                                                  ({d.direction})
                                              </span>
                                          ) : null}
                                      </dd>
                                  </div>
                              ))
                            : null}
                        {bd.prompts && typeof bd.prompts === "object"
                            ? Object.entries(
                                  bd.prompts as Record<string, string>,
                              ).map(([k, v]) => (
                                  <div key={k} style={{ display: "contents" }}>
                                      <dt>
                                          {t("prompt")}/{k}
                                      </dt>
                                      <dd>{v}</dd>
                                  </div>
                              ))
                            : null}
                    </dl>
                </div>
                {(["SB", "KF", "ANI", "DLG"] as Pass[]).map((pass) => (
                    <div className="tfs-card" key={pass}>
                        <h3>
                            {pass} · {passLabel(t, pass)}{" "}
                            <span className="tfs-muted">
                                tf://{shotId}/{pass}
                            </span>
                        </h3>
                        <TakesGrid
                            pid={pid}
                            takes={takes.data?.[pass] ?? []}
                            selected={selectedTake}
                            onSelect={onSelectTake}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function PassView({
    pid,
    owner,
    pass,
    refreshToken,
    selectedTake,
    onSelectTake,
}: PreviewProps & { owner: string; pass: Pass }) {
    const t = useT();
    const takes = useAsync(
        () => studio.takes(pid, owner),
        [pid, owner, refreshToken],
    );
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>
                    {owner} / {pass}{" "}
                    <span className="tfs-muted">{passLabel(t, pass)}</span>
                </h2>
            </div>
            <div className="tfs-preview-body">
                <TakesGrid
                    pid={pid}
                    takes={takes.data?.[pass] ?? []}
                    selected={selectedTake}
                    onSelect={onSelectTake}
                />
            </div>
        </div>
    );
}

/* ---------------- episode ---------------- */

function EpisodeView({
    pid,
    episode,
    refreshToken,
    selectedTake,
    onSelectTake,
}: PreviewProps & { episode: string }) {
    const t = useT();
    const { data, error } = useAsync(
        () => studio.breakdown(pid, episode).catch(() => undefined),
        [pid, episode, refreshToken],
    );
    const post = useAsync(
        () => studio.takes(pid, episode),
        [pid, episode, refreshToken],
    );
    const bd = data?.breakdown as EpisodeBreakdown | undefined;
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>
                    {episode}{" "}
                    <span className="tfs-muted">{bd?.title ?? ""}</span>
                </h2>
            </div>
            <div className="tfs-preview-body">
                {error ? <div className="tfs-error">{error}</div> : null}
                {bd ? (
                    <div className="tfs-card">
                        <h3>{t("shotBreakdown")}</h3>
                        {bd.synopsis ? <p>{bd.synopsis}</p> : null}
                        <table className="tfs-table tfs-shot-table">
                            <thead>
                                <tr>
                                    <th>shot</th>
                                    <th>size</th>
                                    <th>dur</th>
                                    <th>action</th>
                                    <th>{t("dialogue")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bd.scenes.flatMap((s) => [
                                    <tr key={s.id}>
                                        <td colSpan={5}>
                                            <b>{s.id}</b> {s.title ?? ""}{" "}
                                            <span className="tfs-muted">
                                                {s.location ?? ""}{" "}
                                                {s.timeOfDay ?? ""}
                                            </span>
                                        </td>
                                    </tr>,
                                    ...s.shots.map((h) => (
                                        <tr key={h.id}>
                                            <td>{h.id.slice(-6)}</td>
                                            <td>{h.size ?? ""}</td>
                                            <td>{h.duration ?? ""}</td>
                                            <td>{h.action ?? ""}</td>
                                            <td>
                                                {(h.dialogue ?? [])
                                                    .map(
                                                        (d) =>
                                                            `${d.character}: ${d.line}`,
                                                    )
                                                    .join(" / ")}
                                            </td>
                                        </tr>
                                    )),
                                ])}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="tfs-muted">{t("noBreakdown")}</div>
                )}
                {(["MUS", "SFX", "MIX", "CUT"] as Pass[]).map((pass) => (
                    <div className="tfs-card" key={pass}>
                        <h3>
                            {pass} · {passLabel(t, pass)}{" "}
                            <span className="tfs-muted">
                                tf://{episode}/{pass}
                            </span>
                        </h3>
                        <TakesGrid
                            pid={pid}
                            takes={post.data?.[pass] ?? []}
                            selected={selectedTake}
                            onSelect={onSelectTake}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------------- workflow (canvas) ---------------- */

function WorkflowView({
    pid,
    workflowKey,
    locale,
    refreshToken,
    onCanvasSave,
    onRun,
}: PreviewProps & { workflowKey: string }) {
    const t = useT();
    const [state, setState] = useState<string>("");
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>{workflowKey.replace(/^workflows\//, "")}</h2>
                <span className="tfs-muted">{state}</span>
                <span className="tfs-spacer" />
                <button
                    className="tfs-btn primary small"
                    onClick={() => onRun(workflowKey)}
                >
                    {t("run")}
                </button>
                <a
                    className="tfs-btn small"
                    href={fileUrl(pid, workflowKey)}
                    target="_blank"
                    rel="noreferrer"
                >
                    {t("json")}
                </a>
            </div>
            <CanvasPane
                pid={pid}
                workflowKey={workflowKey}
                locale={locale}
                reloadToken={refreshToken}
                onSaved={(s, detail) => {
                    setState(
                        s === "saving"
                            ? t("saving")
                            : s === "saved"
                              ? t("saved")
                              : `${t("saveFailed")}: ${detail ?? ""}`,
                    );
                    onCanvasSave(s, detail);
                }}
            />
        </div>
    );
}

/* ---------------- file ---------------- */

function FileView({
    pid,
    fileKey,
    node,
    refreshToken,
    onChanged,
}: PreviewProps & { fileKey: string }) {
    const t = useT();
    const modality = modalityOfExt(fileKey.split(".").pop() ?? "");
    const url = fileUrl(pid, fileKey);
    const [text, setText] = useState<string | undefined>();
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    useEffect(() => {
        if (modality !== "text") return;
        setText(undefined);
        studio
            .readText(pid, fileKey)
            .then(setText, (e: unknown) =>
                setErr(e instanceof Error ? e.message : String(e)),
            );
    }, [pid, fileKey, modality, refreshToken]);
    const [big, setBig] = useState(false);
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>{node?.label ?? fileKey}</h2>
                <span className="tfs-spacer" />
                {modality === "text" && dirty ? (
                    <button
                        className="tfs-btn small primary"
                        onClick={async () => {
                            await studio.writeText(pid, fileKey, text ?? "");
                            setDirty(false);
                            onChanged();
                        }}
                    >
                        {t("save")}
                    </button>
                ) : null}
                <a
                    className="tfs-btn small"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                >
                    {t("open")}
                </a>
            </div>
            <div className="tfs-preview-body">
                {err ? <div className="tfs-error">{err}</div> : null}
                {modality === "image" ? (
                    <div className="tfs-media" onClick={() => setBig(true)}>
                        <img src={url} alt={fileKey} />
                    </div>
                ) : modality === "video" ? (
                    <div className="tfs-media">
                        <video src={url} controls playsInline />
                    </div>
                ) : modality === "audio" ? (
                    <div className="tfs-media">
                        <audio src={url} controls />
                    </div>
                ) : modality === "text" ? (
                    text === undefined ? (
                        <div className="tfs-muted">…</div>
                    ) : (
                        <textarea
                            className="tfs-textarea"
                            style={{ minHeight: "70vh" }}
                            value={text}
                            onChange={(e) => {
                                setText(e.target.value);
                                setDirty(true);
                            }}
                        />
                    )
                ) : (
                    <div className="tfs-muted">
                        {t("modality", { modality })}
                    </div>
                )}
            </div>
            {big ? (
                <Modal title={fileKey} onClose={() => setBig(false)} wide>
                    <img src={url} alt={fileKey} style={{ maxWidth: "100%" }} />
                </Modal>
            ) : null}
        </div>
    );
}
