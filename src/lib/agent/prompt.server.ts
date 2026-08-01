import "server-only";

/**
 * System prompt assembly: hand-written manual + code-derived catalog.
 *
 * The manual (docs/agent-workflow-manual.md) holds rules, examples and the
 * product FAQ; the catalog is regenerated from the registries whenever the
 * plugins registry changes. Keeping the two sources separate is what stops
 * the prompt from drifting the way hand-maintained node lists do.
 */

import manual from "../../../docs/agent-workflow-manual.md";
import { buildAgentCatalog } from "./catalog.server";

const PREAMBLE = `You are the TongFlow workspace agent. You build and edit
multi-modal AI workflows on the user's canvas through the tools provided, and
you answer questions about using TongFlow. Distinguish questions from build
requests: answer questions directly without touching the canvas. Respond in
the language the user writes in.`;

export function buildSystemPrompt(locale?: string): string {
    const localeHint = locale
        ? `\nThe user's interface language is "${locale}".`
        : "";
    return [
        PREAMBLE + localeHint,
        manual,
        "# Node catalog (generated from the live installation)",
        buildAgentCatalog(),
    ].join("\n\n");
}
