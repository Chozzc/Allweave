"use client";

/**
 * Keyword search over the generated docs corpus (src/generated/agent-docs).
 *
 * The corpus is a few dozen kilobytes per locale, dynamically imported on the
 * first product question so it never loads for users who only build. Plain
 * term scoring is enough at this size — deliberately no vector store.
 */

import type { ToolResult } from "./types";

interface DocChunk {
    source: string;
    heading: string;
    body: string;
}

const SUPPORTED_LOCALES = ["en", "zh", "ja"] as const;
type DocsLocale = (typeof SUPPORTED_LOCALES)[number];

const corpusCache = new Map<DocsLocale, DocChunk[]>();

function currentLocale(): DocsLocale {
    // next-intl stamps the locale on <html lang>. Korean has no localized
    // README — fall back to English and let the model answer in Korean.
    const lang =
        typeof document !== "undefined"
            ? document.documentElement.lang.slice(0, 2)
            : "en";
    return (SUPPORTED_LOCALES as readonly string[]).includes(lang)
        ? (lang as DocsLocale)
        : "en";
}

async function loadCorpus(locale: DocsLocale): Promise<DocChunk[]> {
    const cached = corpusCache.get(locale);
    if (cached) return cached;
    const mod = await import(`@/generated/agent-docs/${locale}.json`);
    const chunks = (mod.default ?? mod).chunks as DocChunk[];
    corpusCache.set(locale, chunks);
    return chunks;
}

function tokenize(text: string): string[] {
    // Latin terms plus CJK bigrams — good enough for three READMEs.
    const lower = text.toLowerCase();
    const latin = lower.match(/[a-z0-9]{2,}/g) ?? [];
    const cjk = lower.match(/[぀-ヿ一-鿿]/g) ?? [];
    const bigrams: string[] = [];
    for (let i = 0; i + 1 < cjk.length; i++) {
        bigrams.push(cjk[i] + cjk[i + 1]);
    }
    return [...latin, ...cjk, ...bigrams];
}

export async function searchDocs(query: string): Promise<ToolResult> {
    if (!query.trim()) return { ok: false, error: "empty query" };

    const locale = currentLocale();
    let corpus: DocChunk[];
    try {
        corpus = await loadCorpus(locale);
        // English docs cover topics the localized READMEs may lack.
        if (locale !== "en") corpus = [...corpus, ...(await loadCorpus("en"))];
    } catch (e) {
        return { ok: false, error: `docs corpus unavailable: ${String(e)}` };
    }

    const terms = new Set(tokenize(query));
    if (terms.size === 0) return { ok: false, error: "unrecognized query" };

    const scored = corpus
        .map((chunk) => {
            const hay = tokenize(`${chunk.heading} ${chunk.body}`);
            const counts = new Map<string, number>();
            for (const t of hay) counts.set(t, (counts.get(t) ?? 0) + 1);
            let score = 0;
            for (const term of terms) {
                const c = counts.get(term) ?? 0;
                if (c > 0) score += 1 + Math.log(c);
                if (tokenize(chunk.heading).includes(term)) score += 2;
            }
            return { chunk, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

    if (scored.length === 0) {
        return {
            ok: true,
            results: [],
            note: "no documentation matched; tell the user the docs do not cover this and point to the project's GitHub / Discord",
        };
    }

    return {
        ok: true,
        results: scored.map(({ chunk }) => ({
            source: chunk.source,
            heading: chunk.heading,
            body: chunk.body,
        })),
    };
}
