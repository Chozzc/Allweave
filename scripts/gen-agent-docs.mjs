#!/usr/bin/env node
/**
 * Chunk the user-facing READMEs into a searchable corpus for the agent's
 * `search_docs` tool. Mirrors the gen:abi convention: output is committed
 * under src/generated/ and regenerated whenever the docs change.
 *
 *   pnpm gen:agent-docs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = {
    en: ["README.md"],
    zh: ["docs/README_ZH.md"],
    ja: ["docs/README_JA.md"],
};

/** Sections that are noise for product Q&A. */
const SKIP_HEADINGS =
    /star history|license|open-source|オープンソース|开源|ライセンス|许可/i;

function chunk(markdown, source) {
    const lines = markdown.split("\n");
    const chunks = [];
    let heading = "";
    let breadcrumb = [];
    let buf = [];

    const flush = () => {
        const body = buf.join("\n").trim();
        if (!body || SKIP_HEADINGS.test(heading)) {
            buf = [];
            return;
        }
        chunks.push({
            source,
            heading: [...breadcrumb, heading].filter(Boolean).join(" › "),
            body: body.length > 2500 ? `${body.slice(0, 2500)}…` : body,
        });
        buf = [];
    };

    for (const line of lines) {
        const m = /^(#{1,3})\s+(.*)$/.exec(line);
        if (m) {
            flush();
            const level = m[1].length;
            heading = m[2].trim();
            breadcrumb = breadcrumb.slice(0, level - 1);
            if (level > 1) breadcrumb[level - 2] = heading;
        } else {
            buf.push(line);
        }
    }
    flush();
    return chunks;
}

const outDir = join(root, "src/generated/agent-docs");
mkdirSync(outDir, { recursive: true });

for (const [locale, files] of Object.entries(SOURCES)) {
    const chunks = files.flatMap((f) =>
        chunk(readFileSync(join(root, f), "utf-8"), f),
    );
    writeFileSync(
        join(outDir, `${locale}.json`),
        `${JSON.stringify({ chunks }, null, 1)}\n`,
    );
    console.log(`agent-docs: ${locale} → ${chunks.length} chunks`);
}
