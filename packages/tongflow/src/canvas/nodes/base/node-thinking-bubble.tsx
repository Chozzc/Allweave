import { Brain } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";

interface NodeThinkingBubbleProps {
    /** Full accumulated (capped) reasoning text streamed from the plugin. */
    text: string | null;
    /** Only shown while the node is running. */
    visible: boolean;
}

/**
 * A transient, auto-scrolling bubble anchored to the right of a node that
 * streams a model's reasoning ("thinking") while it runs. Positioned outside
 * the node body so it never occludes node content, and non-interactive so it
 * doesn't interfere with canvas panning or node selection.
 */
export function NodeThinkingBubble({ text, visible }: NodeThinkingBubbleProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Keep the newest reasoning in view as it streams in.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [text]);

    if (!visible || !text) return null;

    return (
        <div
            className={cn(
                "nodrag pointer-events-none absolute left-full top-0 z-50 ml-3",
                "w-64 animate-in fade-in-0 duration-200",
            )}
        >
            <div className="rounded-lg border border-gray-200 bg-white/95 shadow-lg dark:border-gray-700 dark:bg-gray-800/95">
                <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <Brain className="h-3.5 w-3.5 animate-pulse" />
                    Thinking
                </div>
                <div
                    ref={scrollRef}
                    className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400"
                >
                    {text}
                </div>
            </div>
        </div>
    );
}
