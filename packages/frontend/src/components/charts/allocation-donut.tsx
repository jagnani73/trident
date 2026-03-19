"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { Allocations } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";

interface AllocationDonutProps {
    allocations: Allocations;
}

const LAYERS = [
    { key: "lendingUsdc" as const, label: "Lending", color: "var(--chart-1)" },
    { key: "spreadUsdc" as const, label: "Spread", color: "var(--chart-4)" },
    { key: "basisUsdc" as const, label: "Basis", color: "var(--chart-6)" },
    { key: "idleUsdc" as const, label: "Idle", color: "var(--muted-foreground)" },
];

export function AllocationDonut({ allocations }: AllocationDonutProps) {
    const data = LAYERS.map((l) => ({
        name: l.label,
        value: allocations[l.key],
        color: l.color,
    })).filter((d) => d.value > 0);

    return (
        <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-base font-semibold mb-4">Capital Allocation</h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={2}
                    >
                        {data.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                        formatter={(v: number) => formatCompactUsd(v)}
                    />
                    <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12 }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
