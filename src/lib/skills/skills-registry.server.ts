import "server-only";

/**
 * Skills registry seam: the default backend (src/ext-default/
 * skills-registry.ts) scans tongflow-package-* content packages under the
 * local plugins dir with a dev watcher; a cloud shell substitutes e.g. a
 * build-time baked registry via src/ext/skills-registry.ts.
 */
export {
    invalidateSkillsRegistry,
    loadSkillsRegistry,
} from "@ext/skills-registry";
