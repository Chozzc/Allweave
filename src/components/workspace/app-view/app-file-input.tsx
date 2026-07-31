"use client";

import { FileIcon, Loader2, UploadCloud, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFileAsyncLoader, useFileUrl } from "@/hooks/use-file-async-loader";
import { useDropzone, useMultipleUpload } from "@/hooks/use-upload";
import { cn } from "@/lib/utils";
import type { DataNode } from "@/lib/workflow/executable-workflow";
import { MODEL_FILE_ACCEPT } from "./model-file-accept";

const MAX_FILES = 9;

/** Mime-pattern accepts feed useDropzone's validation; extension-based
 * accepts (3D model formats) only filter the native picker. */
const MIME_ACCEPT: Partial<Record<DataNode["dataType"], string>> = {
    image: "image/*",
    video: "video/*",
    audio: "audio/*",
};

function FilePreview({
    fileKey,
    dataType,
    onRemove,
}: {
    fileKey: string;
    dataType: DataNode["dataType"];
    onRemove: () => void;
}) {
    const { url } = useFileAsyncLoader(fileKey);
    const directUrl = useFileUrl(fileKey);

    return (
        <div className="relative group rounded-lg border border-border/60 overflow-hidden bg-muted/30">
            {dataType === "image" ? (
                url ? (
                    <img
                        src={url}
                        alt={fileKey}
                        className="h-24 w-full object-cover"
                    />
                ) : (
                    <div className="h-24 w-full flex items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                )
            ) : dataType === "video" ? (
                <video
                    src={directUrl}
                    className="h-24 w-full object-cover"
                    muted
                />
            ) : dataType === "audio" ? (
                <div className="h-24 w-full flex items-center justify-center p-2">
                    <audio src={directUrl} controls className="w-full" />
                </div>
            ) : (
                <div className="h-24 w-full flex flex-col items-center justify-center gap-1 p-2">
                    <FileIcon className="size-6 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground truncate max-w-full">
                        {fileKey.split("/").pop()}
                    </span>
                </div>
            )}
            <button
                type="button"
                onClick={onRemove}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
                <X className="size-3" />
            </button>
        </div>
    );
}

export function AppFileInput({
    dataType,
    fileKeys,
    onChange,
    disabled,
}: {
    dataType: DataNode["dataType"];
    fileKeys: string[];
    onChange: (fileKeys: string[]) => void;
    disabled?: boolean;
}) {
    const t = useTranslations("Workspace.appView");

    const { upload, isUploading, progress } = useMultipleUpload({
        onSuccess: (responses) => {
            onChange(responses.map((r) => r.key));
        },
    });

    const mimeAccept = MIME_ACCEPT[dataType];
    const dropzone = useDropzone({
        accept: mimeAccept,
        maxFiles: MAX_FILES,
        onDrop: (files) => {
            void upload(files);
        },
    });

    const inputProps = dropzone.getInputProps();
    // 3D model formats are extension-based; the picker filters, the
    // dropzone validation stays open.
    const inputAccept =
        mimeAccept ?? (dataType === "model" ? MODEL_FILE_ACCEPT : undefined);

    return (
        <div className="space-y-2">
            {fileKeys.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {fileKeys.map((key) => (
                        <FilePreview
                            key={key}
                            fileKey={key}
                            dataType={dataType}
                            onRemove={() =>
                                onChange(fileKeys.filter((k) => k !== key))
                            }
                        />
                    ))}
                </div>
            )}
            <label
                className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors",
                    dropzone.isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-border/70 hover:border-border",
                    disabled || isUploading
                        ? "opacity-60 pointer-events-none"
                        : "cursor-pointer",
                )}
                {...dropzone.getRootProps()}
            >
                <input
                    {...inputProps}
                    accept={inputAccept}
                    className="hidden"
                    disabled={disabled || isUploading}
                />
                {isUploading ? (
                    <>
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            {progress}%
                        </span>
                    </>
                ) : (
                    <>
                        <UploadCloud className="size-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            {t("dropFilesHere")}
                        </span>
                    </>
                )}
            </label>
            {dropzone.error && (
                <p className="text-xs text-red-500">{dropzone.error}</p>
            )}
        </div>
    );
}
