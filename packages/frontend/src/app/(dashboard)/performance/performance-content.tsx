"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/kpi-card";
import { KpiSkeleton, ChartSkeleton } from "@/components/loading-skeleton";
import { ApyChart } from "@/components/charts/apy-chart";
import { TvlChart } from "@/components/charts/tvl-chart";
import { AllocationBar } from "@/components/charts/allocation-bar";
import { useVaultHistory, usePositions } from "@/hooks/use-vault";
import { formatUsd, formatDuration } from "@/lib/format";

export function PerformanceContent() {
    const { data: history, loading: historyLoading } = useVaultHistory();
    const { data: closedPositions, loading: posLoading } = usePositions({ status: "closed" });

    // Compute performance KPIs from closed positions
    const kpis = useMemo(() => {
        if (!closedPositions) return null;
        const items = closedPositions.items;
        const totalPnl = items.reduce((sum, p) => sum + Number(p.realized_pnl || 0), 0);
        const wins = items.filter((p) => Number(p.realized_pnl || 0) > 0).length;
        const winRate = items.length > 0 ? wins / items.length : 0;
        const closedWithDuration = items.filter((p) => p.closed_at);
        const avgDuration =
            closedWithDuration.length > 0
                ? closedWithDuration.reduce((sum, p) => {
                      return sum + (new Date(p.closed_at!).getTime() - new Date(p.opened_at).getTime());
                  }, 0) / closedWithDuration.length
                : 0;
        return { totalPnl, totalTrades: items.length, winRate, avgDuration };
    }, [closedPositions]);

    const loading = historyLoading || posLoading;

    return (
        <div className="space-y-6">
            <h1 className="text-lg font-semibold">Performance</h1>

            {/* KPIs */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <KpiSkeleton key={i} />
                    ))}
                </div>
            ) : kpis ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard
                        title="Cumulative PnL"
                        value={formatUsd(kpis.totalPnl)}
                        deltaType={kpis.totalPnl > 0 ? "profit" : kpis.totalPnl < 0 ? "loss" : "neutral"}
                    />
                    <KpiCard title="Total Trades" value={String(kpis.totalTrades)} />
                    <KpiCard
                        title="Win Rate"
                        value={`${(kpis.winRate * 100).toFixed(1)}%`}
                        deltaType={kpis.winRate >= 0.5 ? "profit" : "loss"}
                    />
                    <KpiCard title="Avg Duration" value={formatDuration(kpis.avgDuration)} />
                </div>
            ) : null}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {history && history.length > 0 ? (
                    <ApyChart data={history} />
                ) : (
                    <ChartSkeleton />
                )}

                {history && history.length > 0 ? (
                    <TvlChart data={history} />
                ) : (
                    <ChartSkeleton />
                )}
            </div>

            {history && history.length > 0 ? (
                <AllocationBar data={history} />
            ) : (
                <ChartSkeleton />
            )}
        </div>
    );
}
