"use client";

/**
 * File URL utilities - local disk backend.
 *
 * Files are saved under `data/uploads/` (see `src/handlers/file-utils.ts`)
 * and served via `GET /api/uploads/[...path]`.
 */

import { assetUrl } from "../../host";

export const getFileUrl = (fileKey: string | undefined | null): string => {
    if (!fileKey || typeof fileKey !== "string") return "";

    // If fileKey is already a full URL, return it as-is
    if (fileKey.startsWith("http://") || fileKey.startsWith("https://")) {
        return fileKey;
    }

    const cleanFileKey = fileKey.startsWith("/") ? fileKey.slice(1) : fileKey;
    return assetUrl(cleanFileKey);
};

export const getPrivateFileUrl = (fileKey: string | undefined | null): string =>
    getFileUrl(fileKey);

export const getSharedFileUrl = (
    _materialId: number,
    fileKey: string | undefined | null,
): string => getFileUrl(fileKey);

export const getMaterialFileUrls = (material: {
    id: number;
    content: string | { fileKeys?: string[] };
}): string[] => {
    const content =
        typeof material.content === "string"
            ? (JSON.parse(material.content) as { fileKeys?: string[] })
            : material.content;

    const fileKeys = content.fileKeys || [];
    return fileKeys.map((key) => getFileUrl(key));
};
