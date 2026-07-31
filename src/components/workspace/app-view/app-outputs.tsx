"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFileAsyncLoader, useFileUrl } from "@/hooks/use-file-async-loader";
import type { AppOutputItem } from "./use-app-form-model";

function CopyTextButton({ text }: { text: string }) {
    const t = useTranslations("Workspace.appView");
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
        >
            {copied ? (
                <Check className="size-3.5 text-emerald-500" />
            ) : (
                <Copy className="size-3.5" />
            )}
            {t("copyText")}
        </Button>
    );
}

function ImageResult({ fileKey }: { fileKey: string }) {
    const { url, isLoading } = useFileAsyncLoader(fileKey);
    if (isLoading || !url) {
        return (
            <div className="aspect-square rounded-lg bg-muted/40 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
        );
    }
    return (
        <a href={url} target="_blank" rel="noopener noreferrer">
            <img
                src={url}
                alt={fileKey}
                className="rounded-lg w-full object-cover"
            />
        </a>
    );
}

function FileResult({ fileKey }: { fileKey: string }) {
    const t = useTranslations("Workspace.appView");
    const url = useFileUrl(fileKey);
    return (
        <a
            href={url}
            download
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
        >
            <Download className="size-4 text-muted-foreground shrink-0" />
            <span className="truncate">{fileKey.split("/").pop()}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                {t("download")}
            </span>
        </a>
    );
}

function VideoResult({ fileKey }: { fileKey: string }) {
    const url = useFileUrl(fileKey);
    return <video src={url} controls className="w-full rounded-lg" />;
}

function AudioResult({ fileKey }: { fileKey: string }) {
    const url = useFileUrl(fileKey);
    return <audio src={url} controls className="w-full" />;
}

function OutputBlock({ output }: { output: AppOutputItem }) {
    if (!output.isFileValues) {
        return (
            <div className="space-y-2">
                {output.values.map((text, i) => (
                    <div
                        key={i}
                        className="rounded-lg border border-border/60 bg-muted/20 p-3"
                    >
                        <p className="text-sm whitespace-pre-wrap wrap-break-word">
                            {text}
                        </p>
                        <div className="mt-1 flex justify-end">
                            <CopyTextButton text={text} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (output.type === "image") {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {output.values.map((key) => (
                    <ImageResult key={key} fileKey={key} />
                ))}
            </div>
        );
    }

    if (output.type === "video") {
        return (
            <div className="space-y-2">
                {output.values.map((key) => (
                    <VideoResult key={key} fileKey={key} />
                ))}
            </div>
        );
    }

    if (output.type === "audio") {
        return (
            <div className="space-y-2">
                {output.values.map((key) => (
                    <AudioResult key={key} fileKey={key} />
                ))}
            </div>
        );
    }

    // model / file / anything else: download links
    return (
        <div className="space-y-2">
            {output.values.map((key) => (
                <FileResult key={key} fileKey={key} />
            ))}
        </div>
    );
}

export function AppOutputs({ outputs }: { outputs: AppOutputItem[] }) {
    const t = useTranslations("Workspace.appView");

    const withValues = outputs.filter((o) => o.values.length > 0);
    if (withValues.length === 0) {
        return (
            <p className="text-sm text-muted-foreground text-center py-6">
                {t("noOutputsYet")}
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {withValues.map((output) => (
                <OutputBlock key={output.nodeId} output={output} />
            ))}
        </div>
    );
}
