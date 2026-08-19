/**
 * Message catalogs the canvas ships with. A host merges the catalog for its
 * locale into its own messages (`{ ...canvasMessages[locale], ...own }`) and
 * provides them through `use-intl`'s `IntlProvider` (or next-intl's
 * `NextIntlClientProvider`, which is the same context).
 */

import en from "./messages/en.json";
import ja from "./messages/ja.json";
import ko from "./messages/ko.json";
import zh from "./messages/zh.json";

export type CanvasLocale = "en" | "zh" | "ja" | "ko";

export const CANVAS_LOCALES: readonly CanvasLocale[] = ["en", "zh", "ja", "ko"];

export const canvasMessages: Record<CanvasLocale, Record<string, unknown>> = {
    en,
    zh,
    ja,
    ko,
};

export function isCanvasLocale(value: string): value is CanvasLocale {
    return (CANVAS_LOCALES as readonly string[]).includes(value);
}
