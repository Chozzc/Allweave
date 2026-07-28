import type { PluginEnvVar } from "@/lib/plugins/plugin-env-manifest-schema";

/**
 * App-side presentation metadata for well-known env keys, merged over the
 * plugin-manifest declarations. Manifests stay the contract for *which* keys
 * exist; this registry only refines how the settings dialog renders them
 * (input widget, section pinning). Localized labels live in the `Settings.keys`
 * i18n namespace, not here.
 *
 * Resolution order for the value shape: registry > manifest `type` > suffix
 * heuristics > "text".
 */

export type EnvValueType =
    | "secret"
    | "select"
    | "boolean"
    | "number"
    | "url"
    | "text";

export interface EnvKeyMeta {
    type?: EnvValueType;
    /** Allowed values for `type: "select"`. */
    options?: string[];
    /** Pins the key to a dedicated dialog section. */
    section?: "modal" | "compute";
}

export const MODAL_TOKEN_ID_ENV = "MODAL_TOKEN_ID";
export const MODAL_TOKEN_SECRET_ENV = "MODAL_TOKEN_SECRET";

export const ENV_KEY_METADATA: Record<string, EnvKeyMeta> = {
    [MODAL_TOKEN_ID_ENV]: { type: "secret", section: "modal" },
    [MODAL_TOKEN_SECRET_ENV]: { type: "secret", section: "modal" },
    HF_TOKEN: { type: "secret", section: "compute" },
    TONGFLOW_MODAL_CALL_TIMEOUT_S: { type: "number" },
    // Enum knobs (values documented by each plugin's manifest description).
    WHISPER_MODEL: {
        type: "select",
        options: ["tiny", "base", "small", "medium", "large"],
    },
    SEEDANCE_RESOLUTION: {
        type: "select",
        options: ["480p", "720p", "1080p", "4k"],
    },
    GEMINI_IMAGE_SIZE: { type: "select", options: ["1K", "2K", "4K"] },
    XAI_IMAGE_RESOLUTION: { type: "select", options: ["1k", "2k"] },
    // Boolean knobs (stored as "true" / "false" strings).
    SEEDANCE_GENERATE_AUDIO: { type: "boolean" },
    SEEDANCE_WATERMARK: { type: "boolean" },
    // Numeric knobs the suffix heuristics don't catch.
    SEEDVR2_LAB_MAX_EDGE: { type: "number" },
    TRIPOSPLAT_STEPS: { type: "number" },
    TRIPOSPLAT_GUIDANCE_SCALE: { type: "number" },
    TRIPOSPLAT_NUM_GAUSSIANS: { type: "number" },
    INFINITETALK_MAX_VIDEO_S: { type: "number" },
};

const SUFFIX_HEURISTICS: Array<[RegExp, EnvValueType]> = [
    [
        /(_API_KEY|_API_SECRET|_TOKEN|_TOKEN_ID|_TOKEN_SECRET|_SECRET|_ACCESS_KEY_ID|_SECRET_ACCESS_KEY)$|^FAL_KEY$/,
        "secret",
    ],
    [/(_BASE_URL|_ENDPOINT|_URL)$/, "url"],
    [/(_TIMEOUT_S|_MAX_VIDEO_S)$/, "number"],
];

/** The input widget to render for a key. */
export function resolveEnvKeyType(
    key: string,
    decl?: Pick<PluginEnvVar, "type">,
): EnvValueType {
    const meta = ENV_KEY_METADATA[key];
    if (meta?.type) return meta.type;
    if (decl?.type) return decl.type;
    for (const [pattern, type] of SUFFIX_HEURISTICS) {
        if (pattern.test(key)) return type;
    }
    return "text";
}

/** Allowed values when the resolved type is "select". */
export function resolveEnvKeyOptions(
    key: string,
    decl?: Pick<PluginEnvVar, "options">,
): string[] | undefined {
    return ENV_KEY_METADATA[key]?.options ?? decl?.options;
}

/** Dialog section a key is pinned to (undefined = default placement). */
export function resolveEnvKeySection(
    key: string,
): "modal" | "compute" | undefined {
    return ENV_KEY_METADATA[key]?.section;
}
