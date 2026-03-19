const usdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
});

export function formatUsd(n: number): string {
    return usdFormatter.format(n);
}

export function formatCompactUsd(n: number): string {
    return compactUsdFormatter.format(n);
}

export function formatPct(n: number): string {
    return `${(n * 100).toFixed(2)}%`;
}

export function formatApy(n: number | null): string {
    if (n === null) return "--";
    return `${n.toFixed(2)}%`;
}

export function formatZScore(n: number): string {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}`;
}

export function formatTime(iso: string, mode: "date" | "time" | "datetime" = "datetime"): string {
    const d = new Date(iso);
    if (mode === "date") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (mode === "time") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/** Map market index to symbol */
export function marketSymbol(index: number): string {
    const map: Record<number, string> = { 0: "SOL", 1: "BTC", 2: "ETH" };
    return map[index] ?? `MKT-${index}`;
}
