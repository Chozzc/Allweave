import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Programmatic `node.data` writes inside an effect (mount-time picker
 * defaults, normalization) must pass `{ history: false }`.
 *
 * Without it the write lands in the undo stack and clears the redo stack;
 * after an undo the effect's guard is true again, so it re-fires, commits
 * another entry and the node can never be undone away. The failure is
 * invisible in review — an omitted optional argument — and has already
 * shipped twice, so it is checked here rather than by eye.
 *
 * A genuine user action (typing, picking a value from a menu) must NOT pass
 * the flag: those belong in history. Only calls inside `useEffect` bodies
 * are examined.
 */

// packages/tongflow/src/canvas — every node component lives under here.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WRITE_CALL = /\b(form\.set|form\.patch|updates|updateNodeData)\(/g;

function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return tsxFiles(path);
        return path.endsWith(".tsx") ? [path] : [];
    });
}

/** Source slice balanced from the opener at `start` to its matching closer. */
function balanced(src: string, start: number, open: string, close: string) {
    let depth = 0;
    for (let i = start; i < src.length; i++) {
        if (src[i] === open) depth++;
        else if (src[i] === close) {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return src.slice(start);
}

function violations(src: string): number[] {
    const out: number[] = [];
    for (const effect of src.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)) {
        const bodyStart = src.indexOf("{", effect.index + "useEffect(".length);
        const body = balanced(src, bodyStart, "{", "}");
        for (const call of body.matchAll(WRITE_CALL)) {
            const argsStart = body.indexOf("(", call.index + call[1].length);
            const args = balanced(body, argsStart, "(", ")");
            if (!args.includes("history: false")) {
                out.push(
                    src.slice(0, bodyStart + call.index).split("\n").length,
                );
            }
        }
    }
    return out;
}

describe("programmatic node.data writes stay out of undo history", () => {
    it("every effect-driven write passes { history: false }", () => {
        const offenders = tsxFiles(ROOT).flatMap((file) =>
            violations(readFileSync(file, "utf8")).map(
                (line) => `${file.slice(ROOT.length + 1)}:${line}`,
            ),
        );
        expect(offenders).toEqual([]);
    });
});
