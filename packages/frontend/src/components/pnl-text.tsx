import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";

interface PnlTextProps {
    value: number;
    className?: string;
}

export function PnlText({ value, className }: PnlTextProps) {
    return (
        <span
            className={cn(
                "font-mono font-medium",
                value > 0 && "text-profit",
                value < 0 && "text-loss",
                value === 0 && "text-muted-foreground",
                className,
            )}
        >
            {formatUsd(value)}
        </span>
    );
}
