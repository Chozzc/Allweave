import { type NextRequest, NextResponse } from "next/server";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";
import { loadEnvStore } from "@/lib/settings/env-store.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/model-catalog?pluginId=<id>
 * Server-side fetch of a plugin's live model catalog when it declares
 * `authEnv`: the stored key is sent as a bearer token and the upstream JSON is
 * returned verbatim for the canvas to filter (`filterModelCatalog`). Public
 * catalogs are fetched by the browser directly and never hit this route.
 */
export async function GET(req: NextRequest) {
    const pluginId = req.nextUrl.searchParams.get("pluginId")?.trim() ?? "";
    const catalog = pluginId
        ? loadPluginsRegistry().plugins[pluginId]?.modelCatalog
        : undefined;
    if (!catalog) {
        return NextResponse.json(
            { error: `No model catalog for plugin ${pluginId || "(none)"}` },
            { status: 404 },
        );
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (catalog.authEnv) {
        const env = await loadEnvStore();
        const token = (
            env[catalog.authEnv] ??
            process.env[catalog.authEnv] ??
            ""
        ).trim();
        if (!token) {
            return NextResponse.json(
                { error: `${catalog.authEnv} is not set` },
                { status: 412 },
            );
        }
        headers.Authorization = `Bearer ${token}`;
    }
    let upstream: Response;
    try {
        upstream = await fetch(catalog.url, {
            headers,
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 502 },
        );
    }
    if (!upstream.ok) {
        return NextResponse.json(
            { error: `Upstream HTTP ${upstream.status}` },
            { status: 502 },
        );
    }
    const body = await upstream.text();
    return new NextResponse(body, {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
    });
}
