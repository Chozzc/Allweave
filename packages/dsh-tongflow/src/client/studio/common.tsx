import { useEffect, useState } from "react";
import type { Pass, TakeInfo } from "../../shared/types.ts";
import { modalityOfExt } from "../../shared/types.ts";
import { fileUrl } from "../api.ts";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | undefined; loading: boolean; reload: () => void } {
    const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        setState((s) => ({ ...s, loading: true }));
        fn().then(
            (data) => alive && setState({ data, loading: false }),
            (error: unknown) => alive && setState({ error: error instanceof Error ? error.message : String(error), loading: false }),
        );
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);
    return { data: state.data, error: state.error, loading: state.loading, reload: () => setTick((t) => t + 1) };
}

export function TakeThumb({ pid, take }: { pid: string; take: TakeInfo }) {
    const url = fileUrl(pid, take.key);
    const modality = modalityOfExt(take.ext);
    if (modality === "image") return <img src={url} alt={take.fileName} loading="lazy" />;
    if (modality === "video") return <video src={url} muted preload="metadata" />;
    return <span className="glyph">{modality === "audio" ? "♪" : modality === "model" ? "◈" : "▤"}</span>;
}

export function TakesGrid({
    pid,
    takes,
    selected,
    onSelect,
}: {
    pid: string;
    takes: TakeInfo[];
    selected?: TakeInfo;
    onSelect: (take: TakeInfo) => void;
}) {
    if (takes.length === 0) return <div className="tfs-muted">no takes yet</div>;
    return (
        <div className="tfs-takes">
            {takes.map((t) => (
                <div
                    key={t.key}
                    className={`tfs-take${t.circled ? " circled" : ""}${selected?.key === t.key ? " selected" : ""}`}
                    onClick={() => onSelect(t)}
                    title={t.fileName}
                >
                    <div className="tfs-take-thumb">
                        <TakeThumb pid={pid} take={t} />
                    </div>
                    <div className="tfs-take-foot">
                        <span>{t.take}</span>
                        {t.circled ? <span className="circle">● circled</span> : <span className="tfs-muted">{fmtBytes(t.size)}</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtTime(iso: string | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function passLabel(pass: Pass): string {
    return (
        {
            REF: "Reference",
            VO: "Voice ref",
            SB: "Storyboard",
            KF: "Keyframe",
            ANI: "Animation",
            DLG: "Dialogue",
            MUS: "Music",
            SFX: "SFX",
            MIX: "Mix",
            CUT: "Cut",
        } as Record<Pass, string>
    )[pass];
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="tfs-modal-backdrop" onClick={onClose}>
            <div className="tfs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="tfs-row" style={{ justifyContent: "space-between" }}>
                    <h2>{title}</h2>
                    <button className="tfs-btn small" onClick={onClose}>
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
