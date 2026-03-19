"use client";

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import type { VaultHistoryPoint } from "@/lib/types";
import { formatCompactUsd, formatTime } from "@/lib/format";

interface TvlChartProps {
    data: VaultHistoryPoint[];
}

export function TvlChart({ data }: TvlChartProps) {
    const chartData = data.map((d) => ({
        time: d.timestamp,
        value: Number(d.total_value_usdc),
    }));

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">Total Value Locked</h3>
            <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                        dataKey="time"
                        tickFormatter={(v) => formatTime(v, "time")}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        tickFormatter={formatCompactUsd}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        width={60}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                        labelFormatter={(v) => formatTime(v as string, "datetime")}
                        formatter={(v: number) => [formatCompactUsd(v), "TVL"]}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--chart-1)"
                        fill="url(#tvlGradient)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
