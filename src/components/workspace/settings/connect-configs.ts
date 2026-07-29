import {
    markModalConnected,
    markModalDisconnected,
} from "@/hooks/use-env-setup";
import {
    HF_TOKEN_ENV,
    MODAL_TOKEN_ID_ENV,
    MODAL_TOKEN_SECRET_ENV,
} from "@/lib/settings/env-key-metadata";
import type { TokenProviderConfig } from "./token-connect";

// Prefix-anchored patterns; a minimum tail length avoids matching a bare
// prefix the user is still typing.

export const MODAL_CONNECT: TokenProviderConfig = {
    ns: "ModalConnect",
    tokensUrl: "https://modal.com/settings/tokens",
    pastePlaceholder: "modal token set --token-id ak-… --token-secret as-…",
    specs: [
        {
            envKey: MODAL_TOKEN_ID_ENV,
            pattern: /ak-[A-Za-z0-9_-]{4,}/,
            masked: true,
            detectedKey: "detectedId",
            missingKey: "missingId",
        },
        {
            envKey: MODAL_TOKEN_SECRET_ENV,
            pattern: /as-[A-Za-z0-9_-]{4,}/,
            masked: false,
            detectedKey: "detectedSecret",
            missingKey: "missingSecret",
        },
    ],
    // The onboarding banner/wizard watch Modal connectivity.
    onConnectedStore: markModalConnected,
    onDisconnectedStore: markModalDisconnected,
};

export const HF_CONNECT: TokenProviderConfig = {
    ns: "HfConnect",
    tokensUrl: "https://huggingface.co/settings/tokens",
    pastePlaceholder: "hf_…",
    specs: [
        {
            envKey: HF_TOKEN_ENV,
            pattern: /hf_[A-Za-z0-9]{10,}/,
            masked: true,
            detectedKey: "detectedToken",
            missingKey: "missingToken",
        },
    ],
};

/**
 * Known API-key prefixes per env key — enables exact extraction from any
 * pasted blob. Keys without an entry fall back to loose extraction (strip
 * `KEY=`, quotes, surrounding prose).
 */
const PROVIDER_KEY_PATTERNS: Record<
    string,
    { pattern: RegExp; placeholder: string }
> = {
    // sk-or- must be tried via its own entry; the generic sk- pattern also
    // matches it, so OpenRouter gets the longer prefix explicitly.
    OPENAI_API_KEY: { pattern: /sk-[A-Za-z0-9_-]{10,}/, placeholder: "sk-…" },
    DEEPSEEK_API_KEY: {
        pattern: /sk-[A-Za-z0-9_-]{10,}/,
        placeholder: "sk-…",
    },
    OPENROUTER_API_KEY: {
        pattern: /sk-or-[A-Za-z0-9_-]{10,}/,
        placeholder: "sk-or-…",
    },
    REPLICATE_API_TOKEN: {
        pattern: /r8_[A-Za-z0-9]{10,}/,
        placeholder: "r8_…",
    },
    XAI_API_KEY: { pattern: /xai-[A-Za-z0-9_-]{10,}/, placeholder: "xai-…" },
    GEMINI_API_KEY: {
        pattern: /AIza[A-Za-z0-9_-]{10,}/,
        placeholder: "AIza…",
    },
};

/**
 * Config for a model-service provider whose settings card exposes a single
 * required API key. Copy comes from the shared `ProviderConnect` namespace,
 * interpolated with the provider's display name; the get-key URL comes from
 * the plugin manifest.
 */
export function providerConnectConfig(
    providerTitle: string,
    envKey: string,
    tokensUrl?: string,
): TokenProviderConfig {
    const known = PROVIDER_KEY_PATTERNS[envKey];
    return {
        ns: "ProviderConnect",
        tokensUrl,
        pastePlaceholder: known?.placeholder ?? "API Key",
        specs: [
            {
                envKey,
                pattern: known?.pattern,
                masked: true,
                detectedKey: "detected",
                missingKey: "missing",
            },
        ],
        tValues: { provider: providerTitle },
    };
}
