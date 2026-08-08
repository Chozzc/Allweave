/**
 * Skill packages: `tongflow-package-*` directories under the plugins dir that
 * ship reusable prompt packs (no executable plugin code). Each skill is one
 * markdown file under `skills/` — frontmatter for metadata, body as the prompt.
 * Shared by the server-side registry and the client picker/hook.
 */

export interface SkillDefinition {
    /** File-name slug (without `.md`), unique within its package. */
    id: string;
    name: string;
    description?: string;
    /** Picker grouping hint: conventionally "text" | "image-prompt" | "video-prompt". */
    category?: string;
    /** Prompt body (markdown after the frontmatter). */
    content: string;
}

export interface SkillsPackage {
    id: string;
    /** Presentation metadata from the package's `tongflow.plugin.json`. */
    name?: string;
    description?: string;
    icon?: string;
    skills: SkillDefinition[];
}

export interface SkillsRegistry {
    generatedAt: string;
    packages: Record<string, SkillsPackage>;
    errors?: { packageId: string; message: string }[];
}

/** Reference stored on a node (`node.data.skill`) — non-ABI, UI-only. */
export interface SkillRef {
    package: string;
    id: string;
    /** Name snapshot so an uninstalled package still renders a labelled chip. */
    name: string;
}
