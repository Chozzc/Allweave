import { type NextRequest, NextResponse } from "next/server";
import { logger } from "tongflow";
import {
    PluginInstallError,
    uninstallPlugin,
} from "@/lib/plugins/plugins-install.server";

export const runtime = "nodejs";

/**
 * POST /api/plugins/uninstall
 * Body: `{ id }`. Removes the plugin directory and rescans the registry.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as { id?: string };
        if (!body.id) {
            return NextResponse.json(
                { error: "id is required" },
                { status: 400 },
            );
        }

        const result = await uninstallPlugin(body.id);

        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (e) {
        if (e instanceof PluginInstallError) {
            return NextResponse.json(
                { error: e.message },
                { status: e.status },
            );
        }
        const message = e instanceof Error ? e.message : String(e);
        logger.error("[plugins] uninstall failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
