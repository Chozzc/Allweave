import type { PluginModelCatalog } from "./plugins-registry-schema";

/** Read a dot-path (`a.b.c`) off an unknown JSON value; `undefined` when absent. */
function getPath(value: unknown, path: string): unknown {
    let cur: unknown = value;
    for (const key of path.split(".")) {
        if (cur === null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
}

/** Substring match against the field's JSON serialization (strings as-is). */
function fieldContains(value: unknown, token: string): boolean {
    if (value === undefined || value === null) return false;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.includes(token);
}

/**
 * Filter a fetched catalog payload into `slot -> model ids`, applying the
 * plugin's declared `exclude` and per-slot `slots` rules (substring tokens,
 * `!`-prefixed = must be absent). Ids keep catalog order; malformed records
 * are skipped. Pure — the fetch lives in the canvas.
 */
export function filterModelCatalog(
    catalog: PluginModelCatalog,
    payload: unknown,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const slot of Object.keys(catalog.slots)) out[slot] = [];
    const items = getPath(payload, catalog.items);
    if (!Array.isArray(items)) return out;
    const exclude = Object.entries(catalog.exclude ?? {});
    for (const record of items) {
        const id = getPath(record, catalog.id);
        if (typeof id !== "string" || !id.trim()) continue;
        if (
            exclude.some(
                ([field, literal]) => getPath(record, field) === literal,
            )
        )
            continue;
        for (const [slot, rules] of Object.entries(catalog.slots)) {
            const ok = Object.entries(rules).every(([field, tokens]) => {
                const value = getPath(record, field);
                return (Array.isArray(tokens) ? tokens : [tokens]).every(
                    (token) =>
                        token.startsWith("!")
                            ? !fieldContains(value, token.slice(1))
                            : fieldContains(value, token),
                );
            });
            if (ok && !out[slot].includes(id)) out[slot].push(id);
        }
    }
    return out;
}
