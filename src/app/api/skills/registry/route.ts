import { NextResponse } from "next/server";
import { loadSkillsRegistry } from "@/lib/skills/skills-registry.server";

export const runtime = "nodejs";

/**
 * GET /api/skills/registry
 * Returns the skills registry (no-store): every skill found in installed
 * `tongflow-package-*` content packages, for the node skill picker.
 */
export async function GET() {
    return NextResponse.json(loadSkillsRegistry(), {
        headers: { "Cache-Control": "no-store" },
    });
}
