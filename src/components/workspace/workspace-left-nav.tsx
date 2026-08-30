"use client";

import { FolderOpen, Loader2, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Button,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    type TaskRecord,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "tongflow/canvas";
import { PortfolioDialog } from "@/components/workspace/portfolio-dialog";
import { WorkflowDialog } from "@/components/workspace/workflow-dialog";
import { listBrowserTasks } from "@/lib/browser-storage";

const buttonClass =
    "h-10 w-10 rounded-xl border border-gray-100 bg-white transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

export function WorkspaceLeftNav() {
    const t = useTranslations("Navigation");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        listBrowserTasks(1, 100)
            .then((result) => setTasks(result.tasks))
            .finally(() => setLoading(false));
    }, [open]);

    return (
        <>
            <div className="flex items-center gap-2">
                <WorkflowDialog
                    tooltip={t("workflows")}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("workflows")}
                            className={buttonClass}
                        >
                            <Workflow className="size-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    }
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("tasks")}
                            className={buttonClass}
                            onClick={() => setOpen(true)}
                        >
                            <Zap className="size-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("tasks")}</TooltipContent>
                </Tooltip>
                <PortfolioDialog
                    tooltip={t("portfolio")}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("portfolio")}
                            className={buttonClass}
                        >
                            <FolderOpen className="size-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    }
                />
            </div>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="left" className="flex flex-col">
                    <SheetHeader>
                        <SheetTitle>{t("myTasks")}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                        {loading ? (
                            <Loader2 className="mx-auto mt-8 size-6 animate-spin text-muted-foreground" />
                        ) : tasks.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                {t("noTasks")}
                            </p>
                        ) : (
                            tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className="rounded-lg border p-3"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-medium">
                                            {task.feature}
                                        </span>
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                                            {task.status}
                                        </span>
                                    </div>
                                    {task.error && (
                                        <p className="mt-2 line-clamp-2 text-xs text-red-500">
                                            {task.error}
                                        </p>
                                    )}
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {new Date(
                                            task.createdAt,
                                        ).toLocaleString()}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
