"use client";

import { useApi } from "./use-api";
import type { BotStatus, BotEventsResponse } from "@/lib/types";

export function useBotStatus() {
    return useApi<BotStatus>("/bot/status", undefined, 10_000);
}

export function useBotEvents(filters?: { event_type?: string }) {
    return useApi<BotEventsResponse>("/bot/events", {
        event_type: filters?.event_type,
    });
}
