"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
    LayoutDashboard,
    ArrowLeftRight,
    TrendingUp,
    Activity,
    Sun,
    Moon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useBotStatus } from "@/hooks/use-bot";

const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/positions", label: "Positions", icon: ArrowLeftRight },
    { href: "/performance", label: "Performance", icon: TrendingUp },
    { href: "/signals", label: "Signals", icon: Activity },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const { data: botStatus } = useBotStatus();

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* Top Bar */}
            <header className="fixed top-0 left-0 right-0 z-40 h-12 bg-card border-b border-border flex items-center px-4">
                {/* Brand */}
                <span className="font-semibold text-primary text-sm tracking-wide mr-8">
                    TRIDENT
                </span>

                {/* Nav Tabs */}
                <nav className="flex items-center gap-1">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                                isActive(href)
                                    ? "text-primary bg-accent"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            )}
                        >
                            <Icon className="size-4" />
                            <span className="hidden sm:inline">{label}</span>
                        </Link>
                    ))}
                </nav>

                {/* Right side */}
                <div className="ml-auto flex items-center gap-3">
                    {/* Theme toggle */}
                    <button
                        type="button"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    </button>

                    {/* Bot status */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div
                            className={cn(
                                "size-2 rounded-full",
                                botStatus?.running ? "bg-profit" : "bg-muted-foreground",
                            )}
                        />
                        <span>{botStatus?.running ? "Running" : "Stopped"}</span>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="mt-12 p-4">{children}</main>
        </>
    );
}
