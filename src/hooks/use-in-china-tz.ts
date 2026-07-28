"use client";

import { useEffect, useState } from "react";

/**
 * Client timezone heuristic for mainland China, where Discord is unreachable
 * and the WeChat group is the community channel that actually works.
 */
export function useInChinaTz(): boolean {
    const [inChina, setInChina] = useState(false);
    useEffect(() => {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            setInChina(tz === "Asia/Shanghai" || tz === "Asia/Urumqi");
        } catch {
            // keep the default (Discord)
        }
    }, []);
    return inChina;
}
