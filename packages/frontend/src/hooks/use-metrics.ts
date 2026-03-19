"use client";

import { useApi } from "./use-api";
import type { FundingRatesResponse, SpreadMetricsResponse } from "@/lib/types";

export function useFundingRates() {
    return useApi<FundingRatesResponse>("/metrics/funding", undefined, 15_000);
}

export function useSpreadMetrics() {
    return useApi<SpreadMetricsResponse>("/metrics/spreads", undefined, 15_000);
}
