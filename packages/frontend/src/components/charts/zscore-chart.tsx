"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    ReferenceLine,
    Legend,
} from "recharts";
import type { SpreadSnapshot } from "@/lib/types";
import { formatTime, formatZScore } from "@/lib/format";

interface ZScoreChartProps {
    data: SpreadSnapshot[];
    pairs: string[];
}

const PAIR_COLORS: Record<string, string> = {
    "SOL/ETH": "var(--chart-1)",
    "BTC/ETH": "var(--chart-4)",
};

export function ZScoreChart({ data, pairs }: ZScoreChartProps) {
    // Group by timestamp, pivot pairs into columns
    const timeMap = new Map<string, Record<string, string | number>>();

    for (const snap of data) {
        const key = snap.timestamp;
        if (!timeMap.has(key)) timeMap.set(key, { time: snap.timestamp });
        const row = timeMap.get(key)!;
        row[snap.pair_name] = Number(snap.z_score);
    }

    const chartData = Array.from(timeMap.values()).sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">Spread Z-Scores</h3>
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
                        tickFormatter={(v) => formatZScore(v)}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        width={50}
                        domain={[-3, 3]}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                        labelFormatter={(v) => formatTime(v as string, "datetime")}
                        formatter={(v: number) => [formatZScore(v)]}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={2} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "+2.0", fill: "var(--warning)", fontSize: 10 }} />
                    <ReferenceLine y={-2} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "-2.0", fill: "var(--warning)", fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                    {pairs.map((pair) => (
                        <Line
                            key={pair}
                            type="monotone"
                            dataKey={pair}
                            name={pair}
                            stroke={PAIR_COLORS[pair] ?? "var(--chart-3)"}
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
