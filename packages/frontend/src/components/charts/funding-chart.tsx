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
import type { FundingRateSnapshot } from "@/lib/types";
import { formatTime, marketSymbol } from "@/lib/format";

interface FundingChartProps {
    data: FundingRateSnapshot[];
    markets: number[];
}

const MARKET_COLORS: Record<number, string> = {
    0: "var(--chart-1)",
    1: "var(--chart-3)",
    2: "var(--chart-4)",
};

export function FundingChart({ data, markets }: FundingChartProps) {
    // Group by timestamp, pivot markets into columns
    const timeMap = new Map<string, Record<string, unknown>>();

    for (const snap of data) {
        const key = snap.timestamp;
        if (!timeMap.has(key)) timeMap.set(key, { time: snap.timestamp });
        const row = timeMap.get(key)!;
        // Convert to APR: rate * 24 * 365 * 100
        row[marketSymbol(snap.market_index)] = Number(snap.funding_rate) * 24 * 365 * 100;
    }

    const chartData = Array.from(timeMap.values()).sort(
        (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime(),
    );

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">Funding Rate APR</h3>
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
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
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
                    {markets.map((m) => (
                        <Line
                            key={m}
                            type="monotone"
                            dataKey={marketSymbol(m)}
                            name={marketSymbol(m)}
                            stroke={MARKET_COLORS[m] ?? "var(--chart-5)"}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
