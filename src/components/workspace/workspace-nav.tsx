"use client";

/**
 * Workspace top-right corner: theme toggle and language selector.
 */

import { Globe, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "tongflow/canvas";
import { PluginsDialog } from "@/components/workspace/plugins-dialog";
import { SettingsDialog } from "@/components/workspace/settings/settings-dialog";

const LOCALE_OPTIONS = [
    { code: "zh", label: "中文" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
] as const;

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

function ThemeToggleButton() {
    const t = useTranslations("Navigation");
    const [mounted, setMounted] = useState(false);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsDark(document.documentElement.classList.contains("dark"));
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const nextDark = !document.documentElement.classList.contains("dark");
        if (nextDark) {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
        setIsDark(nextDark);
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    className={navBtnClass}
                    aria-label={t("toggleTheme")}
                >
                    {!mounted ? (
                        <Moon className="h-5 w-5 opacity-40" />
                    ) : isDark ? (
                        <Sun className="h-5 w-5" />
                    ) : (
                        <Moon className="h-5 w-5" />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("toggleTheme")}</TooltipContent>
        </Tooltip>
    );
}

function LocaleMenu() {
    const t = useTranslations("Navigation");
    const locale = useLocale();
    const router = useRouter();

    const setLocale = (next: string) => {
        if (next === locale) return;
        // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not available in all target browsers
        document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
        router.refresh();
    };

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={navBtnClass}
                            aria-label={t("language")}
                        >
                            <Globe className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("language")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-[140px]">
                {LOCALE_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                        key={opt.code}
                        className="cursor-pointer"
                        onClick={() => setLocale(opt.code)}
                    >
                        <span className="flex-1">{opt.label}</span>
                        {locale === opt.code ? (
                            <span className="text-primary">✓</span>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function WorkspaceNav() {
    return (
        <div className="flex items-center gap-2">
            <PluginsDialog />
            <SettingsDialog />
            <ThemeToggleButton />
            <LocaleMenu />
        </div>
    );
}
