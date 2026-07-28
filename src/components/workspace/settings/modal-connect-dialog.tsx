"use client";

import { useTranslations } from "next-intl";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ModalConnectForm } from "./modal-connect-form";

/** Thin dialog wrapper around the connect form (settings card, banner). */
export function ModalConnectDialog({
    open,
    onOpenChange,
    onConnected,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected?: () => void;
}) {
    const t = useTranslations("ModalConnect");
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("subtitle")}</DialogDescription>
                </DialogHeader>
                <ModalConnectForm
                    onConnected={() => {
                        onOpenChange(false);
                        onConnected?.();
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
