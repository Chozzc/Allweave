/**
 * Maps the panel's plugin selection to an OpenAI-compatible chat endpoint.
 *
 * The pickable list is the intersection of gen-text-slot plugins (what the
 * scanner found installed) and this adapter map (which of those expose a
 * streaming tool-use chat API). Modal-deployed LLM plugins run as tasks and
 * have no such endpoint, so they are deliberately absent.
 *
 * Isomorphic on purpose: the panel filters its picker on the id set, the
 * route resolves keys. Nothing here is secret — base URLs and env-var NAMES
 * only; values stay in the server env store.
 */

export interface ChatAdapter {
    baseURL: string;
    envKey: string;
    /** Fallback env keys some plugins also accept. */
    altEnvKeys?: string[];
}

export const CHAT_ADAPTERS: Record<string, ChatAdapter> = {
    "tongflow-router-openrouter": {
        baseURL: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
    },
    "tongflow-api-openai": {
        baseURL: "https://api.openai.com/v1",
        envKey: "OPENAI_API_KEY",
    },
    "tongflow-api-gemini": {
        // Gemini's OpenAI-compatibility endpoint.
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        envKey: "GEMINI_API_KEY",
        altEnvKeys: ["GOOGLE_API_KEY"],
    },
    "tongflow-api-deepseek": {
        baseURL: "https://api.deepseek.com/v1",
        envKey: "DEEPSEEK_API_KEY",
    },
    "tongflow-api-xai": {
        baseURL: "https://api.x.ai/v1",
        envKey: "XAI_API_KEY",
        altEnvKeys: ["GROK_API_KEY"],
    },
    "tongflow-api-bytedance": {
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        envKey: "ARK_API_KEY",
    },
    "tongflow-router-apimart": {
        baseURL: "https://api.apimart.ai/v1",
        envKey: "APIMART_API_KEY",
    },
    "tongflow-api-agnes": {
        baseURL: "https://apihub.agnes-ai.com/v1",
        envKey: "AGNES_API_KEY",
    },
};

export function isChatCapablePlugin(pluginId: string): boolean {
    return pluginId in CHAT_ADAPTERS;
}

export interface ResolvedAgentProvider {
    baseURL: string;
    apiKey: string;
}

export type ProviderError = "unsupported_plugin" | "missing_key";

export function resolveAgentProvider(
    pluginId: string,
    env: Record<string, string>,
):
    | { ok: true; provider: ResolvedAgentProvider }
    | { ok: false; error: ProviderError; envKey?: string } {
    const adapter = CHAT_ADAPTERS[pluginId];
    if (!adapter) return { ok: false, error: "unsupported_plugin" };

    const apiKey =
        env[adapter.envKey] ??
        adapter.altEnvKeys?.map((k) => env[k]).find(Boolean);
    if (!apiKey) {
        return { ok: false, error: "missing_key", envKey: adapter.envKey };
    }

    return { ok: true, provider: { baseURL: adapter.baseURL, apiKey } };
}
