import { isInternalEnvKey } from "@ext/settings-internal-keys";
import { type NextRequest, NextResponse } from "next/server";
import { loadPluginEnvDecls } from "@/lib/plugins/plugin-env-manifests.server";
import {
    type EnvStore,
    loadEnvStore,
    saveEnvStore,
} from "@/lib/settings/env-store.server";

export const runtime = "nodejs";

/** The env map as exposed to the settings UI: internal keys stripped. */
function visibleEnv(env: EnvStore): EnvStore {
    const out: EnvStore = {};
    for (const [k, v] of Object.entries(env)) {
        if (!isInternalEnvKey(k)) out[k] = v;
    }
    return out;
}

function parseEnvBody(body: unknown): EnvStore | null {
    const raw = (body as { env?: unknown })?.env;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const env: EnvStore = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "string") env[k] = v;
    }
    return env;
}

/**
 * GET /api/settings/env
 * Returns the user-managed environment key/value map (settings.json) plus
 * the env vars declared by installed plugins (`tongflow.plugin.json`), so
 * the settings dialog gets values and declarations in one fetch.
 */
export async function GET() {
    return NextResponse.json(
        {
            env: visibleEnv(await loadEnvStore()),
            pluginEnv: loadPluginEnvDecls(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

/**
 * PUT /api/settings/env
 * Replaces the entire user-visible env map. Body: `{ env: Record<string,string> }`.
 * TongFlow stays platform-agnostic: it does not validate which keys are present;
 * each plugin documents the keys it needs in its own README.
 *
 * Internal keys are invisible to the client (see GET), so they are ignored in
 * the incoming map and re-applied from the current store — a save must never
 * wipe platform bookkeeping (e.g. a cloud shell's executor endpoint).
 */
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const env = parseEnvBody(body);
    if (!env) {
        return NextResponse.json(
            { error: "Body must be { env: Record<string,string> }" },
            { status: 400 },
        );
    }

    const next: EnvStore = {};
    for (const [k, v] of Object.entries(env)) {
        if (!isInternalEnvKey(k)) next[k] = v;
    }
    // Fresh read right before save keeps the race window with concurrent
    // internal-key writers (e.g. executor provisioning) minimal.
    for (const [k, v] of Object.entries(await loadEnvStore())) {
        if (isInternalEnvKey(k)) next[k] = v;
    }

    await saveEnvStore(next);
    return NextResponse.json({ env: visibleEnv(await loadEnvStore()) });
}

/**
 * PATCH /api/settings/env
 * Partial merge. Body: `{ env: Record<string,string> }` — a non-empty value
 * sets the key, an empty string deletes it, keys not mentioned are untouched.
 * Used by focused flows (Modal connect/disconnect, onboarding) that must not
 * round-trip the whole map. Internal keys are ignored.
 */
export async function PATCH(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const patch = parseEnvBody(body);
    if (!patch) {
        return NextResponse.json(
            { error: "Body must be { env: Record<string,string> }" },
            { status: 400 },
        );
    }

    const next = await loadEnvStore();
    for (const [k, v] of Object.entries(patch)) {
        if (isInternalEnvKey(k)) continue;
        if (v.trim()) next[k] = v;
        else delete next[k];
    }

    await saveEnvStore(next);
    return NextResponse.json({ env: visibleEnv(await loadEnvStore()) });
}
