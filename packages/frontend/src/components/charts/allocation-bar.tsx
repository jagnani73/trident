"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend,
} from "recharts";
import type { VaultHistoryPoint } from "@/lib/types";
import { formatTime } from "@/lib/format";

interface AllocationBarProps {
    data: VaultHistoryPoint[];
}

export function AllocationBar({ data }: AllocationBarProps) {
    const chartData = data.map((d) => {
        const total = Number(d.total_value_usdc) || 1;
        return {
            time: d.timestamp,
            Lending: (Number(d.lending_allocation) / total) * 100,
            Spread: (Number(d.spread_allocation) / total) * 100,
            Basis: (Number(d.basis_allocation) / total) * 100,
            Idle: (Number(d.idle_allocation) / total) * 100,
        };
    });

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">Allocation Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                        dataKey="time"
                        tickFormatter={(v) => formatTime(v, "time")}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        tickFormatter={(v) => `${v}%`}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        width={40}
                        domain={[0, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                        labelFormatter={(v) => formatTime(v as string, "datetime")}
                        formatter={(v: number) => [`${v.toFixed(1)}%`]}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Lending" stackId="a" fill="var(--chart-1)" />
                    <Bar dataKey="Spread" stackId="a" fill="var(--chart-4)" />
                    <Bar dataKey="Basis" stackId="a" fill="var(--chart-6)" />
                    <Bar dataKey="Idle" stackId="a" fill="var(--muted-foreground)" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
