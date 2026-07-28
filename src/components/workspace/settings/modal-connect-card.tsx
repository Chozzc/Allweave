"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markModalDisconnected } from "@/hooks/use-env-setup";
import { apiPatch } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import {
    MODAL_TOKEN_ID_ENV,
    MODAL_TOKEN_SECRET_ENV,
} from "@/lib/settings/env-key-metadata";
import { ModalConnectDialog } from "./modal-connect-dialog";

function maskTokenId(id: string): string {
    if (id.length <= 10) return id;
    return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

/**
 * Hero card of the Compute section. Disconnected: the one-line story plus a
 * prominent connect button. Connected: masked token id with reconnect /
 * disconnect. Disconnecting clears only the two Modal token keys — any
 * platform bookkeeping (e.g. a cloud executor endpoint) is internal and
 * intentionally retained so a reconnect reuses it.
 */
export function ModalConnectCard({
    tokenId,
    tokenSecret,
    onChanged,
}: {
    tokenId: string;
    tokenSecret: string;
    /** Called after connect/disconnect so the dialog refetches its env map. */
    onChanged: () => void;
}) {
    const t = useTranslations("ModalConnect");
    const [connectOpen, setConnectOpen] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const connected = Boolean(tokenId.trim() && tokenSecret.trim());

    const disconnect = async () => {
        setDisconnecting(true);
        try {
            await apiPatch("/api/settings/env", {
                env: {
                    [MODAL_TOKEN_ID_ENV]: "",
                    [MODAL_TOKEN_SECRET_ENV]: "",
                },
            });
            markModalDisconnected();
            toast.success(t("disconnectedToast"));
            onChanged();
        } catch (error) {
            logger.error("Failed to disconnect Modal:", error);
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("cardTitle")}</span>
                {connected ? (
                    <Badge
                        variant="secondary"
                        className="gap-1 text-green-600 dark:text-green-500"
                    >
                        <CheckCircle2 className="h-3 w-3" />
                        {t("connectedBadge")}
                    </Badge>
                ) : null}
            </div>

            {connected ? (
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                        {maskTokenId(tokenId.trim())}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setConnectOpen(true)}
                        >
                            {t("reconnect")}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-red-600"
                                    disabled={disconnecting}
                                >
                                    {disconnecting ? (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {t("disconnect")}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        {t("disconnectConfirmTitle")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {t("disconnectConfirmBody")}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        {t("disconnectCancel")}
                                    </AlertDialogCancel>
                                    <AlertDialogAction onClick={disconnect}>
                                        {t("disconnect")}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {t("cardBlurb")}
                    </p>
                    <Button
                        type="button"
                        className="w-full"
                        onClick={() => setConnectOpen(true)}
                    >
                        {t("connectCta")}
                    </Button>
                </div>
            )}

            <ModalConnectDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                onConnected={onChanged}
            />
        </div>
    );
}
