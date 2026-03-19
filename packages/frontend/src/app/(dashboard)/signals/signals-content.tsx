"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartSkeleton, TableSkeleton } from "@/components/loading-skeleton";
import { ZScoreChart } from "@/components/charts/zscore-chart";
import { FundingChart } from "@/components/charts/funding-chart";
import { useFundingRates, useSpreadMetrics } from "@/hooks/use-metrics";
import { formatZScore, formatUsd, formatApy, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function actionColor(action: string) {
    if (action.startsWith("enter")) return "bg-profit-muted text-profit";
    if (action.startsWith("exit")) return "bg-loss-muted text-loss";
    return "bg-secondary text-muted-foreground";
}

export function SignalsContent() {
    const { data: spreads, loading: spreadsLoading } = useSpreadMetrics();
    const { data: funding, loading: fundingLoading } = useFundingRates();

    const pairs = [...new Set(spreads?.history?.map((s) => s.pair_name) ?? [])];
    const markets = [...new Set(funding?.history?.map((f) => f.market_index) ?? [])];

    return (
        <div className="space-y-6">
            <h1 className="text-lg font-semibold">Signals</h1>

            {/* Live Spread Signals */}
            {spreads?.live && spreads.live.length > 0 && (
                <div>
                    <h2 className="text-base font-semibold mb-3">Spread Signals</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {spreads.live.map((s) => (
                            <div
                                key={s.pair}
                                className="bg-card border border-border rounded-lg p-4"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-sm">{s.pair}</span>
                                    <Badge
                                        variant="secondary"
                                        className={cn("text-xs", actionColor(
                                            s.zScore !== null
                                                ? Math.abs(s.zScore) >= 2
                                                    ? s.zScore > 0 ? "enter_short" : "enter_long"
                                                    : Math.abs(s.zScore) <= 0.5
                                                      ? "exit"
                                                      : "hold"
                                                : "hold",
                                        ))}
                                    >
                                        {s.zScore !== null
                                            ? Math.abs(s.zScore) >= 2
                                                ? s.zScore > 0 ? "Enter Short" : "Enter Long"
                                                : Math.abs(s.zScore) <= 0.5
                                                  ? "Exit"
                                                  : "Hold"
                                            : "No Data"}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Z-Score</p>
                                        <p
                                            className={cn(
                                                "font-mono font-medium",
                                                s.zScore !== null && Math.abs(s.zScore) >= 2
                                                    ? "text-profit"
                                                    : s.zScore !== null && Math.abs(s.zScore) >= 1.5
                                                      ? "text-warning"
                                                      : "text-foreground",
                                            )}
                                        >
                                            {s.zScore !== null ? formatZScore(s.zScore) : "--"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Ratio</p>
                                        <p className="font-mono">{s.ratio.toFixed(4)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Prices</p>
                                        <p className="font-mono text-xs">
                                            {formatUsd(s.priceA)} / {formatUsd(s.priceB)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Funding Rates Table */}
            <div>
                <h2 className="text-base font-semibold mb-3">Funding Rates</h2>
                {fundingLoading ? (
                    <TableSkeleton rows={3} />
                ) : funding?.live && funding.live.length > 0 ? (
                    <div className="rounded-lg border border-border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted">
                                    <TableHead className="text-xs font-medium tracking-wide uppercase">Market</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Funding Rate</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase text-right">APR</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Oracle Price</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase text-right">Mark Price</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase">Signal</TableHead>
                                    <TableHead className="text-xs font-medium tracking-wide uppercase">Updated</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {funding.live.map((f) => {
                                    const action =
                                        Math.abs(f.fundingRateApr) >= 15 ? "enter_basis" : "hold";
                                    return (
                                        <TableRow key={f.marketIndex} className="border-b border-border hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-semibold text-sm">{f.symbol}</TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {f.fundingRate.toFixed(6)}
                                            </TableCell>
                                            <TableCell
                                                className={cn(
                                                    "text-right font-mono font-medium text-sm",
                                                    f.fundingRateApr > 0 ? "text-profit" : "text-loss",
                                                )}
                                            >
                                                {formatApy(f.fundingRateApr)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatUsd(f.oraclePrice)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatUsd(f.markPrice)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className={cn("text-xs", actionColor(action))}>
                                                    {action === "enter_basis" ? "Enter Basis" : "Hold"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {formatTime(new Date(f.lastFundingTs * 1000).toISOString(), "time")}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <TableSkeleton rows={3} />
                )}
            </div>

            {/* Historical Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {spreadsLoading ? (
                    <ChartSkeleton />
                ) : spreads?.history && spreads.history.length > 0 ? (
                    <ZScoreChart data={spreads.history} pairs={pairs} />
                ) : (
                    <ChartSkeleton />
                )}

                {fundingLoading ? (
                    <ChartSkeleton />
                ) : funding?.history && funding.history.length > 0 ? (
                    <FundingChart data={funding.history} markets={markets} />
                ) : (
                    <ChartSkeleton />
                )}
            </div>
        </div>
    );
}
