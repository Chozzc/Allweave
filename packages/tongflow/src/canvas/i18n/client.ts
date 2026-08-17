/**
 * Client-side translator for non-React contexts (utilities, lib code,
 * thrown errors that surface via toast). React components should keep
 * using `useTranslations()` from `use-intl` instead.
 *
 * The locale is whatever the host last announced via `setCanvasLocale`
 * (`CanvasProvider` does this from its `locale` prop); it defaults to "en".
 */

import { createTranslator } from "use-intl/core";
import { type CanvasLocale, canvasMessages, isCanvasLocale } from "./messages";

let currentLocale: CanvasLocale = "en";

/** Announce the active UI locale (called by `CanvasProvider`). */
export function setCanvasLocale(locale: string): void {
    if (isCanvasLocale(locale)) currentLocale = locale;
}

export function getCanvasLocale(): CanvasLocale {
    return currentLocale;
}

// Loose typing: createTranslator's strict shape inference collapses to `never`
// across our locale union, so we surface a looser `(key, vars?) => string`
// signature via ClientTranslator below.
export type ClientTranslator = (
    key: string,
    values?: Record<string, string | number>,
) => string;

export function getClientTranslator(namespace?: string): ClientTranslator {
    const t = createTranslator({
        locale: currentLocale,
        messages: canvasMessages[currentLocale],
        namespace,
    });
    return t as unknown as ClientTranslator;
}
