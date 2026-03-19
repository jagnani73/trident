"use client";

import { KpiCard } from "@/components/kpi-card";
import { KpiSkeleton, ChartSkeleton } from "@/components/loading-skeleton";
import { TvlChart } from "@/components/charts/tvl-chart";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { useVaultState, useVaultHistory } from "@/hooks/use-vault";
import { formatUsd, formatPct, formatApy } from "@/lib/format";

export function DashboardContent() {
    const { data: vault, loading: vaultLoading } = useVaultState();
    const { data: history, loading: historyLoading } = useVaultHistory();

    return (
        <div className="space-y-6">
            <h1 className="text-lg font-semibold">Dashboard</h1>

            {/* KPI Grid */}
            {vaultLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <KpiSkeleton key={i} />
                    ))}
                </div>
            ) : vault ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    <KpiCard title="Total Value" value={formatUsd(vault.totalValueUsdc)} />
                    <KpiCard title="Free Collateral" value={formatUsd(vault.freeCollateral)} />
                    <KpiCard
                        title="24h APY"
                        value={formatApy(vault.apy24h)}
                        deltaType={vault.apy24h && vault.apy24h > 0 ? "profit" : "neutral"}
                    />
                    <KpiCard
                        title="7d APY"
                        value={formatApy(vault.apy7d)}
                        deltaType={vault.apy7d && vault.apy7d > 0 ? "profit" : "neutral"}
                    />
                    <KpiCard
                        title="Drawdown"
                        value={formatPct(vault.drawdownPct)}
                        deltaType={vault.drawdownPct > 0.02 ? "loss" : "neutral"}
                    />
                    <KpiCard
                        title="Health Rate"
                        value={vault.healthRate.toFixed(2)}
                        deltaType={vault.healthRate < 1.3 ? "loss" : "neutral"}
                    />
                    <KpiCard
                        title="Positions"
                        value={String(vault.activePositionCount)}
                    />
                    <KpiCard
                        title="Leverage"
                        value={`${vault.leverage.toFixed(2)}x`}
                    />
                </div>
            ) : null}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {vault?.allocations ? (
                    <AllocationDonut allocations={vault.allocations} />
                ) : (
                    <ChartSkeleton />
                )}

                {historyLoading ? (
                    <ChartSkeleton />
                ) : history && history.length > 0 ? (
                    <TvlChart data={history} />
                ) : (
                    <ChartSkeleton />
                )}
            </div>

            {/* Data source indicator */}
            {vault && !vault.live && (
                <p className="text-xs text-muted-foreground">
                    Showing cached data — Drift connection unavailable
                </p>
            )}
        </div>
    );
}
