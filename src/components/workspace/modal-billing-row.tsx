"use client";

import { ExternalLink } from "lucide-react";
import { getClientTranslator } from "tongflow/canvas";
import { openExternalUrl } from "@/lib/desktop/open-external";

const MODAL_BILLING_URL = "https://modal.com/settings/billing";

/**
 * Action line for the "Modal needs a payment method" failure: the fix lives in
 * Modal's console, not in TongFlow, so the toast links straight there. Uses
 * getClientTranslator because this renders inside a react-hot-toast portal,
 * outside the intl provider tree.
 */
export function ModalBillingRow({ url }: { url?: string }) {
    const t = getClientTranslator("Errors");

    return (
        <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
            <button
                type="button"
                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                onClick={() => openExternalUrl(url || MODAL_BILLING_URL)}
            >
                {t("openModalBilling")}
                <ExternalLink className="h-3 w-3" />
            </button>
        </div>
    );
}
