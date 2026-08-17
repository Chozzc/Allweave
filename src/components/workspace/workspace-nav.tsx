"use client";

/**
 * Workspace top-right corner: theme toggle, language selector, community links
 */

import { Globe, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
import { useInChinaTz } from "@/hooks/use-in-china-tz";

const LOCALE_OPTIONS = [
    { code: "zh", label: "中文" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
] as const;

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

import { DISCORD_URL } from "@/constants/community";

// Discord SVG Icon
const DiscordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

// WeChat SVG Icon
const WeChatIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.407-.03v-.002zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
);

/**
 * Community entry: Discord everywhere, except for users in mainland China
 * (client timezone heuristic — Discord is unreachable there) who get the
 * WeChat group QR code in a dialog instead.
 */
function CommunityButton() {
    const t = useTranslations("Navigation");
    const inChina = useInChinaTz();
    const [showQR, setShowQR] = useState(false);

    const label = inChina ? t("wechatGroup") : t("community");

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            inChina
                                ? setShowQR(true)
                                : window.open(DISCORD_URL, "_blank")
                        }
                        className={navBtnClass}
                        aria-label={label}
                    >
                        {inChina ? (
                            <WeChatIcon className="h-5 w-5" />
                        ) : (
                            <DiscordIcon className="h-5 w-5" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
            <Dialog open={showQR} onOpenChange={setShowQR}>
                <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                        <DialogTitle>{t("wechatGroup")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-3">
                        <img
                            src="/wechat-group-qr.png"
                            alt={t("wechatGroup")}
                            className="h-56 w-56 rounded-lg bg-white p-2"
                        />
                        <p className="text-muted-foreground text-center text-sm">
                            {t("wechatGroupHint")}
                        </p>
                        <a
                            href={DISCORD_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                        >
                            {t("community")}
                        </a>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

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
            {/* Managed platforms (cloud) provision plugins themselves —
                hide the install entry there. Inlined at build time. */}
            {process.env.NEXT_PUBLIC_MANAGED_PLUGINS !== "1" && (
                <PluginsDialog />
            )}
            <SettingsDialog />
            <ThemeToggleButton />
            <LocaleMenu />
            <CommunityButton />
        </div>
    );
}
