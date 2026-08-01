"use client";

import { AlertCircle, Check, Loader2, Wrench, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AgentUiEntry } from "@/hooks/use-agent-chat";
import type { GraphPatch } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

/** One-line human description of a tool call for the activity row. */
function useToolLabel() {
    const t = useTranslations("Agent.tools");
    return (name: string, args: Record<string, unknown>): string => {
        switch (name) {
            case "apply_graph_patch": {
                const patch = args as GraphPatch;
                const parts: string[] = [];
                const adds = patch.add_nodes?.length ?? 0;
                const edges = patch.add_edges?.length ?? 0;
                const updates = patch.update_nodes?.length ?? 0;
                const removes = patch.remove_nodes?.length ?? 0;
                if (adds) parts.push(t("addNodes", { count: adds }));
                if (edges) parts.push(t("addEdges", { count: edges }));
                if (updates) parts.push(t("updateNodes", { count: updates }));
                if (removes) parts.push(t("removeNodes", { count: removes }));
                return parts.join(" · ") || t("patch");
            }
            case "read_canvas":
                return t("readCanvas");
            case "validate_workflow":
                return t("validate");
            case "describe_node_type":
                return t("describe", { type: String(args.type ?? "") });
            case "search_docs":
                return t("searchDocs", { query: String(args.query ?? "") });
            case "list_workflows":
                return t("listWorkflows");
            case "load_workflow":
                return t("loadWorkflow");
            case "save_workflow":
                return t("saveWorkflow");
            default:
                return name;
        }
    };
}

export function AgentEntryView({ entry }: { entry: AgentUiEntry }) {
    const t = useTranslations("Agent");
    const toolLabel = useToolLabel();

    switch (entry.kind) {
        case "user":
            return (
                <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
                        {entry.text}
                        {entry.attachments && entry.attachments.length > 0 && (
                            <div className="mt-1 text-xs opacity-80">
                                {entry.attachments
                                    .map((a) => `#${a.index} ${a.name}`)
                                    .join(", ")}
                            </div>
                        )}
                    </div>
                </div>
            );

        case "assistant":
            if (!entry.text && !entry.streaming) return null;
            return (
                <div className="flex justify-start">
                    <div className="max-w-[92%] text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {entry.text}
                        {entry.streaming && (
                            <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-foreground/60 animate-pulse" />
                        )}
                    </div>
                </div>
            );

        case "tool": {
            const pending = entry.result === undefined;
            const failed = entry.result !== undefined && !entry.result.ok;
            return (
                <div
                    className={cn(
                        "flex items-center gap-2 text-xs rounded-md border px-2 py-1.5",
                        failed
                            ? "border-destructive/40 text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : failed ? (
                        <X className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    )}
                    <Wrench className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="truncate">
                        {toolLabel(entry.name, entry.args)}
                        {failed && entry.result && "error" in entry.result
                            ? ` — ${entry.result.error}`
                            : ""}
                    </span>
                </div>
            );
        }

        case "error":
            return (
                <div className="flex items-start gap-2 text-xs rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-2 py-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="break-words">
                        {entry.code === "turn_limit"
                            ? t("turnLimit")
                            : entry.message}
                    </span>
                </div>
            );
    }
}
