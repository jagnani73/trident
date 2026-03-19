import { Inbox } from "lucide-react";

interface EmptyStateProps {
    message?: string;
}

export function EmptyState({ message = "No data available" }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="size-10 mb-3" />
            <p className="text-sm">{message}</p>
        </div>
    );
}
