"use client";

import { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PnlText } from "@/components/pnl-text";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { usePositions } from "@/hooks/use-vault";
import { formatUsd, formatZScore, formatDuration, marketSymbol } from "@/lib/format";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | "open" | "closed";

const TABS: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
];

export function PositionsContent() {
    const [status, setStatus] = useState<FilterStatus>("all");
    const { data, loading } = usePositions({
        status: status === "all" ? undefined : status,
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold">Positions</h1>
                <div className="flex gap-1 bg-secondary rounded-md p-0.5">
                    {TABS.map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            onClick={() => setStatus(tab.value)}
                            className={cn(
                                "px-3 py-1 text-sm rounded transition-colors",
                                status === tab.value
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <TableSkeleton rows={6} />
            ) : !data || data.items.length === 0 ? (
                <EmptyState message="No positions found" />
            ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted">
                                <TableHead className="text-xs font-medium tracking-wide uppercase">Type</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase">Pair</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase">Side</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Size</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Entry</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Exit</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase text-right">PnL</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Z-Score</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase">Duration</TableHead>
                                <TableHead className="text-xs font-medium tracking-wide uppercase">Close Reason</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.items.map((pos) => {
                                const pairLabel =
                                    pos.market_b_index !== null
                                        ? `${marketSymbol(pos.market_a_index)}/${marketSymbol(pos.market_b_index)}`
                                        : marketSymbol(pos.market_a_index);

                                const duration = pos.closed_at
                                    ? formatDuration(new Date(pos.closed_at).getTime() - new Date(pos.opened_at).getTime())
                                    : "Active";

                                return (
                                    <TableRow key={pos.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={cn(
                                                    "text-xs",
                                                    pos.type === "spread"
                                                        ? "bg-chart-4/10 text-chart-4"
                                                        : "bg-chart-6/10 text-chart-6",
                                                )}
                                            >
                                                {pos.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{pairLabel}</TableCell>
                                        <TableCell className="text-sm">
                                            {pos.side_a}{pos.side_b ? ` / ${pos.side_b}` : ""}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatUsd(Number(pos.size_usdc))}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatUsd(Number(pos.entry_price_a))}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {pos.exit_price_a ? formatUsd(Number(pos.exit_price_a)) : "--"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {pos.realized_pnl ? (
                                                <PnlText value={Number(pos.realized_pnl)} />
                                            ) : (
                                                <span className="text-muted-foreground font-mono text-sm">--</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {pos.entry_z_score ? formatZScore(Number(pos.entry_z_score)) : "--"}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{duration}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {pos.close_reason ?? "--"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {data && (
                <p className="text-xs text-muted-foreground">
                    Showing {data.items.length} of {data.total} positions
                </p>
            )}
        </div>
    );
}
