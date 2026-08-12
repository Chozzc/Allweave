import fs from "node:fs";
import { join, relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { logger } from "@/lib/logger";
import { PluginEnvManifestSchema } from "@/lib/plugins/plugin-env-manifest-schema";
import { pluginsDir } from "@/lib/runtime/paths.server";
import type {
    SkillDefinition,
    SkillsPackage,
    SkillsRegistry,
} from "@/lib/skills/types";

/**
 * Default skills registry backend: scan `tongflow-package-*` content packages
 * under the local plugins dir (with a dev watcher for live rescans). A cloud
 * shell substitutes e.g. a build-time baked registry via
 * `src/ext/skills-registry.ts`.
 */

const PACKAGE_PREFIX = "tongflow-package-";
const SKILLS_SUBDIR = "skills";
const MANIFEST_FILE = "tongflow.plugin.json";

let cached: SkillsRegistry | null = null;
let watcher: FSWatcher | null = null;
let rescanTimer: NodeJS.Timeout | null = null;

/**
 * Minimal frontmatter parser: a leading `---` line, `key: value` pairs, and a
 * closing `---` line. Returns null when the block is missing or unterminated.
 */
function parseFrontmatter(
    src: string,
): { meta: Record<string, string>; body: string } | null {
    const lines = src.split(/\r?\n/);
    if (lines[0]?.trim() !== "---") return null;
    const meta: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "---") {
            return {
                meta,
                body: lines
                    .slice(i + 1)
                    .join("\n")
                    .trim(),
            };
        }
        const sepIdx = line.indexOf(":");
        if (sepIdx === -1) continue;
        const key = line.slice(0, sepIdx).trim();
        const value = line.slice(sepIdx + 1).trim();
        if (key) meta[key] = value;
    }
    return null;
}

function parseSkillFile(id: string, src: string): SkillDefinition | null {
    const parsed = parseFrontmatter(src);
    if (!parsed || !parsed.meta.name) return null;
    return {
        id,
        name: parsed.meta.name,
        description: parsed.meta.description || undefined,
        category: parsed.meta.category || undefined,
        content: parsed.body,
    };
}

function readPackageMeta(
    dir: string,
): Pick<SkillsPackage, "name" | "description" | "icon"> {
    try {
        const raw = fs.readFileSync(join(dir, MANIFEST_FILE), "utf8");
        const parsed = PluginEnvManifestSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) return {};
        return {
            name: parsed.data.plugin?.name,
            description: parsed.data.plugin?.description,
            icon: parsed.data.plugin?.icon,
        };
    } catch {
        return {};
    }
}

function scanSkills(): SkillsRegistry {
    const root = pluginsDir();
    const packages: Record<string, SkillsPackage> = {};
    const errors: { packageId: string; message: string }[] = [];

    let entries: string[] = [];
    try {
        entries = fs.readdirSync(root).sort();
    } catch {
        // Plugins dir not created yet — empty registry.
    }

    for (const id of entries) {
        if (!id.startsWith(PACKAGE_PREFIX)) continue;
        const dir = join(root, id);
        try {
            if (!fs.statSync(dir).isDirectory()) continue;
        } catch {
            continue;
        }

        const skillsDir = join(dir, SKILLS_SUBDIR);
        const skills: SkillDefinition[] = [];
        let files: string[] = [];
        try {
            files = fs
                .readdirSync(skillsDir)
                .filter((f) => f.endsWith(".md"))
                .sort();
        } catch {
            errors.push({
                packageId: id,
                message: `${skillsDir}: missing ${SKILLS_SUBDIR}/ directory`,
            });
        }
        for (const file of files) {
            const path = join(skillsDir, file);
            let skill: SkillDefinition | null = null;
            try {
                skill = parseSkillFile(
                    file.replace(/\.md$/, ""),
                    fs.readFileSync(path, "utf8"),
                );
            } catch (e) {
                errors.push({
                    packageId: id,
                    message: `${path}: ${e instanceof Error ? e.message : String(e)}`,
                });
                continue;
            }
            if (!skill) {
                errors.push({
                    packageId: id,
                    message: `${path}: missing or malformed frontmatter (expected a leading --- block with a name)`,
                });
                continue;
            }
            skills.push(skill);
        }

        packages[id] = { id, ...readPackageMeta(dir), skills };
    }

    return {
        generatedAt: new Date().toISOString(),
        packages,
        errors: errors.length > 0 ? errors : undefined,
    };
}

function scheduleRescan(): void {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
        cached = scanSkills();
        logger.debug("[skills] Registry refreshed");
    }, 300);
}

// chokidar v4 has no glob support, so watch the plugins root and filter events
// down to tongflow-package-* content in the handler.
function ensureDevWatcher(): void {
    if (process.env.NODE_ENV === "production" || watcher) return;
    watcher = chokidar.watch(pluginsDir(), {
        ignoreInitial: true,
        ignored: (path) =>
            [".git", "__pycache__", ".venv", "node_modules"].some((part) =>
                path.split(sep).includes(part),
            ),
    });
    watcher.on("all", (_event, path) => {
        const rel = relative(pluginsDir(), path);
        if (!rel.startsWith(PACKAGE_PREFIX)) return;
        scheduleRescan();
    });
    watcher.on("error", (e) => {
        logger.warn(
            "[skills] Registry watcher error:",
            e instanceof Error ? e.message : String(e),
        );
    });
}

export function loadSkillsRegistry(): SkillsRegistry {
    if (cached) return cached;
    ensureDevWatcher();
    cached = scanSkills();
    return cached;
}

export function invalidateSkillsRegistry(): SkillsRegistry {
    cached = null;
    if (rescanTimer) {
        clearTimeout(rescanTimer);
        rescanTimer = null;
    }
    return loadSkillsRegistry();
}
