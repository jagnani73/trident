"use client";

import { useApi } from "./use-api";
import type {
    VaultState,
    PositionItem,
    PaginatedResponse,
    VaultHistoryPoint,
} from "@/lib/types";

export function useVaultState() {
    return useApi<VaultState>("/vault/state", undefined, 10_000);
}

export function usePositions(filters?: { status?: string; type?: string }) {
    return useApi<PaginatedResponse<PositionItem>>(
        "/vault/positions",
        { status: filters?.status, type: filters?.type },
    );
}

export function useVaultHistory(from?: string, to?: string) {
    return useApi<VaultHistoryPoint[]>("/vault/history", { from, to }, 30_000);
}
