import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function KpiSkeleton() {
    return (
        <div className="bg-card border border-border rounded-lg p-3">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-6 w-28 mb-1" />
            <Skeleton className="h-3 w-16" />
        </div>
    );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted px-4 py-2">
                <Skeleton className="h-3 w-full" />
            </div>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="border-b border-border px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                </div>
            ))}
        </div>
    );
}

export function ChartSkeleton() {
    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-[300px] w-full" />
        </div>
    );
}
