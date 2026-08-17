/**
 * POST /api/upload
 * File upload endpoint. Persists via the storage driver (local disk by
 * default, under the scoped uploads directory).
 */

import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "tongflow";
import { getStorage } from "@/lib/file/storage.server";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 },
            );
        }

        const ext = path.extname(file.name).replace(/^\./, "");
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileKey = await getStorage().saveFile(buffer, ext);

        const url = `/api/uploads/${fileKey}`;

        return NextResponse.json({
            fileKey,
            url,
            size: file.size,
            name: file.name,
        });
    } catch (error) {
        logger.error("[API /api/upload] Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file" },
            { status: 500 },
        );
    }
}
