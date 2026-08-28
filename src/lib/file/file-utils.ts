/**
 * File utility functions
 *
 * Thin wrappers over the storage driver seam (`storage.server.ts`); the
 * default driver saves files to the scoped local `uploads/` directory.
 */

import { getStorage } from "@/lib/file/storage.server";

/**
 * Read a file under the uploads root by its fileKey (same as in
 * {@link getFileUrl}). Rejects path traversal.
 */
export async function readUploadFileByFileKey(
    fileKey: string,
): Promise<Buffer> {
    return getStorage().readFile(fileKey);
}

/**
 * Save byte data and return the fileKey
 */
export async function saveFile(
    data: Buffer | Uint8Array,
    ext: string,
    taskId?: string,
): Promise<string> {
    return getStorage().saveFile(data, ext, taskId);
}

/**
 * Download a file from a URL and save it locally
 */
export async function downloadAndSave(
    url: string,
    ext: string,
    taskId?: string,
): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Download failed: ${response.status} ${response.statusText}`,
        );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveFile(buffer, ext, taskId);
}

/**
 * Get the public access URL for a file (relative path)
 */
export function getFileUrl(fileKey: string): string {
    // Absolute references pass through — see assetUrl in the canvas host.
    if (/^https?:\/\//.test(fileKey)) return fileKey;
    return `/api/uploads/${fileKey}`;
}
