import { NextResponse } from "next/server";
import { loadPluginEnvDecls } from "@/lib/plugins/plugin-env-manifests.server";
import {
    MODAL_TOKEN_ID_ENV,
    MODAL_TOKEN_SECRET_ENV,
} from "@/lib/settings/env-key-metadata";
import { loadEnvStore } from "@/lib/settings/env-store.server";

export const runtime = "nodejs";

/**
 * GET /api/settings/env-status
 * Secret-free setup status for onboarding surfaces (wizard, banner), so the
 * client can decide whether to nag without fetching the whole env map.
 */
export async function GET() {
    const env = await loadEnvStore();
    // Outside the managed cloud, tokens may come from the shell environment
    // (withStoredEnv inherits process.env) — those users are connected too.
    // In managed mode the host's own env must not fake user connectivity.
    const managed = process.env.NEXT_PUBLIC_MANAGED_PLUGINS === "1";
    const tokenId =
        env[MODAL_TOKEN_ID_ENV] ??
        (managed ? undefined : process.env[MODAL_TOKEN_ID_ENV]);
    const tokenSecret =
        env[MODAL_TOKEN_SECRET_ENV] ??
        (managed ? undefined : process.env[MODAL_TOKEN_SECRET_ENV]);

    const modalRelevant = loadPluginEnvDecls().some((d) =>
        d.env.some((v) => v.key === MODAL_TOKEN_ID_ENV),
    );

    return NextResponse.json(
        {
            modalConnected: Boolean(tokenId && tokenSecret),
            modalRelevant,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
