"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend,
} from "recharts";
import type { VaultHistoryPoint } from "@/lib/types";
import { formatTime } from "@/lib/format";

interface ApyChartProps {
    data: VaultHistoryPoint[];
}

export function ApyChart({ data }: ApyChartProps) {
    const chartData = data.map((d) => ({
        time: d.timestamp,
        apy24h: d.apy_24h ? Number(d.apy_24h) : null,
        apy7d: d.apy_7d ? Number(d.apy_7d) : null,
    }));

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">APY Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                        dataKey="time"
                        tickFormatter={(v) => formatTime(v, "time")}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        tickFormatter={(v) => `${v.toFixed(1)}%`}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        width={50}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                        labelFormatter={(v) => formatTime(v as string, "datetime")}
                        formatter={(v: number) => [`${v.toFixed(2)}%`]}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Line
                        type="monotone"
                        dataKey="apy24h"
                        name="24h APY"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                    />
                    <Line
                        type="monotone"
                        dataKey="apy7d"
                        name="7d APY"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
