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
