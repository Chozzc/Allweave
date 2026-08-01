"use client";

/**
 * Right-side agent chat panel. Rendered as a flex sibling of the canvas so
 * ReactFlow resizes naturally; the toggle button lives in the workspace's
 * top-right cluster.
 */

import { ArrowUp, Eraser, Loader2, Paperclip, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChat } from "@/hooks/use-agent-chat";
import {
    useNodePluginIds,
    useNodePluginModels,
    usePluginsRegistry,
} from "@/hooks/use-plugins-registry";
import { useMultipleUpload } from "@/hooks/use-upload";
import { isChatCapablePlugin } from "@/lib/agent/chat-adapters";
import type { AgentAttachment } from "@/lib/agent/types";
import { isImageFile, isVideoFile } from "@/lib/upload/validation";
import { cn } from "@/lib/utils";
import { pluginDisplayName } from "../nodes/base/node-plugin-id-select";
import { AgentEntryView } from "./agent-message";

const PROVIDER_STORAGE_KEY = "agentProvider";

function classifyFile(
    file: File,
): Pick<AgentAttachment, "modality" | "addNodeType"> {
    if (isImageFile(file)) {
        return { modality: "imageNode", addNodeType: "addImageNode" };
    }
    if (isVideoFile(file)) {
        return { modality: "videoNode", addNodeType: "addVideoNode" };
    }
    if (file.type.startsWith("audio/")) {
        return { modality: "audioNode", addNodeType: "addAudioNode" };
    }
    if (/\.(glb|gltf|obj|fbx|ply|splat)$/i.test(file.name)) {
        return { modality: "modelNode", addNodeType: "addModelNode" };
    }
    return { modality: "fileNode", addNodeType: "addFileNode" };
}

function ProviderPicker() {
    const t = useTranslations("Agent");
    usePluginsRegistry();
    const { pluginId, model, setProvider } = useAgentChat();

    const genTextPlugins = useNodePluginIds("gen-text");
    const chatPlugins = genTextPlugins.filter(isChatCapablePlugin);
    const models = useNodePluginModels("gen-text", pluginId);

    // Restore persisted choice / default to the first chat-capable plugin.
    useEffect(() => {
        if (pluginId || chatPlugins.length === 0) return;
        let initial: { pluginId?: string; model?: string } = {};
        try {
            initial = JSON.parse(
                localStorage.getItem(PROVIDER_STORAGE_KEY) ?? "{}",
            ) as { pluginId?: string; model?: string };
        } catch {
            /* corrupted entry — fall through to defaults */
        }
        const plugin =
            initial.pluginId && chatPlugins.includes(initial.pluginId)
                ? initial.pluginId
                : chatPlugins[0];
        setProvider(plugin, initial.model ?? "");
    }, [pluginId, chatPlugins, setProvider]);

    const persist = (p: string, m: string) => {
        setProvider(p, m);
        localStorage.setItem(
            PROVIDER_STORAGE_KEY,
            JSON.stringify({ pluginId: p, model: m }),
        );
    };

    if (chatPlugins.length === 0) {
        return (
            <span className="text-xs text-muted-foreground">
                {t("noLlmPlugin")}
            </span>
        );
    }

    return (
        <div className="flex items-center gap-1 min-w-0">
            <Select value={pluginId} onValueChange={(v) => persist(v, "")}>
                <SelectTrigger className="h-7 text-xs w-[120px]">
                    <SelectValue placeholder={t("selectPlugin")} />
                </SelectTrigger>
                <SelectContent>
                    {chatPlugins.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                            {pluginDisplayName(p)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {models.length > 0 && (
                <Select
                    value={model || models[0]}
                    onValueChange={(v) => persist(pluginId, v)}
                >
                    <SelectTrigger className="h-7 text-xs w-[150px]">
                        <SelectValue placeholder={t("selectModel")} />
                    </SelectTrigger>
                    <SelectContent>
                        {models.map((m) => (
                            <SelectItem key={m} value={m} className="text-xs">
                                {m}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}

export function AgentPanel() {
    const t = useTranslations("Agent");
    const {
        open,
        status,
        entries,
        attachments,
        missingEnvKey,
        toggle,
        send,
        stop,
        clear,
        addAttachments,
        removeAttachment,
        model,
        setProvider,
        pluginId,
    } = useAgentChat();
    const models = useNodePluginModels("gen-text", pluginId);

    const [input, setInput] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { upload, isUploading } = useMultipleUpload();

    // Default the model once the plugin's model list is known.
    useEffect(() => {
        if (pluginId && !model && models.length > 0) {
            setProvider(pluginId, models[0]);
        }
    }, [pluginId, model, models, setProvider]);

    // Follow the transcript.
    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [entries.length, status]);

    if (!open) return null;

    const busy = status !== "idle";

    const handleSend = () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        void send(text);
    };

    const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length === 0) return;
        // One at a time so file name/mime stay zipped with the upload result.
        const uploaded: AgentAttachment[] = [];
        for (const file of files) {
            const responses = await upload([file]);
            const res = responses[0];
            if (!res) continue;
            uploaded.push({
                index: 0, // assigned by the store
                fileKey: res.key,
                url: res.url,
                name: file.name,
                mime: file.type || "application/octet-stream",
                size: file.size,
                ...classifyFile(file),
            });
        }
        if (uploaded.length > 0) addAttachments(uploaded);
    };

    return (
        <div className="w-[380px] shrink-0 h-full border-l bg-background flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
                <span className="text-sm font-medium shrink-0">
                    {t("title")}
                </span>
                <ProviderPicker />
                <div className="flex items-center shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={clear}
                        title={t("clear")}
                        disabled={entries.length === 0}
                    >
                        <Eraser className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={toggle}
                        title={t("close")}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Transcript */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            >
                {entries.length === 0 && (
                    <div className="text-sm text-muted-foreground space-y-2 mt-4">
                        <p>{t("emptyHint")}</p>
                        <ul className="space-y-1">
                            {[t("example1"), t("example2"), t("example3")].map(
                                (ex) => (
                                    <li key={ex}>
                                        <button
                                            type="button"
                                            className="text-left w-full rounded-md border px-2 py-1.5 hover:bg-accent text-xs"
                                            onClick={() => setInput(ex)}
                                        >
                                            {ex}
                                        </button>
                                    </li>
                                ),
                            )}
                        </ul>
                    </div>
                )}
                {entries.map((entry, i) => (
                    // The transcript is append-only, so the index is stable.
                    <AgentEntryView key={`entry-${i}`} entry={entry} />
                ))}
                {missingEnvKey !== null && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                        <p className="font-medium">{t("missingKeyTitle")}</p>
                        <p className="text-muted-foreground">
                            {missingEnvKey
                                ? t("missingKeyBody", { envKey: missingEnvKey })
                                : t("noProviderBody")}
                        </p>
                    </div>
                )}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
                <div className="px-3 pb-1 flex flex-wrap gap-1">
                    {attachments.map((a) => (
                        <span
                            key={a.index}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-muted"
                        >
                            #{a.index} {a.name}
                            <button
                                type="button"
                                onClick={() => removeAttachment(a.index)}
                                className="hover:text-destructive"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="border-t p-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                        ) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={t("placeholder")}
                    className="min-h-[60px] max-h-[160px] resize-none text-sm"
                    disabled={busy}
                />
                <div className="flex items-center justify-between mt-1.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy || isUploading}
                        title={t("attach")}
                    >
                        {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Paperclip className="h-4 w-4" />
                        )}
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFiles}
                    />
                    {busy ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={stop}
                        >
                            <Square className="h-3.5 w-3.5 mr-1" />
                            {t("stop")}
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            className={cn("h-7 w-7")}
                            onClick={handleSend}
                            disabled={!input.trim()}
                            title={t("send")}
                        >
                            <ArrowUp className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
