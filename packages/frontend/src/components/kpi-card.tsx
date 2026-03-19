import { cn } from "@/lib/utils";

interface KpiCardProps {
    title: string;
    value: string;
    delta?: string;
    deltaType?: "profit" | "loss" | "neutral";
}

export function KpiCard({ title, value, delta, deltaType = "neutral" }: KpiCardProps) {
    return (
        <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {title}
            </p>
            <p className="text-xl font-semibold font-mono text-foreground mt-1">{value}</p>
            {delta && (
                <p
                    className={cn(
                        "text-xs font-mono mt-0.5",
                        deltaType === "profit" && "text-profit",
                        deltaType === "loss" && "text-loss",
                        deltaType === "neutral" && "text-muted-foreground",
                    )}
                >
                    {delta}
                </p>
            )}
        </div>
    );
}
