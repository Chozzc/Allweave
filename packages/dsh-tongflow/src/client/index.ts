/**
 * dsh-tongflow — browser half.
 *
 * Registers the Studio view tab into the conversation view ring. Everything
 * except the shell's platform modules is bundled into lib/client.js.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Type-only: the 'conversation.view' SlotMap row must be in the program.
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { StudioView } from "./studio/StudioView.tsx";

export const inject = ["slots"];

export function apply(ctx: ClientContext): void {
    ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
            {
                name: "conversation.view",
                id: "tongflow-studio",
                order: 50,
                label: "Studio",
            },
            StudioView,
        ),
    );
}
