// ── Vault ────────────────────────────────────────────────────

export interface Allocations {
    totalValueUsdc: number;
    lendingUsdc: number;
    spreadUsdc: number;
    basisUsdc: number;
    idleUsdc: number;
}

export interface VaultState {
    live: boolean;
    totalValueUsdc: number;
    freeCollateral: number;
    leverage: number;
    allocations: Allocations | null;
    apy24h: number | null;
    apy7d: number | null;
    drawdownPct: number;
    healthRate: number;
    activePositionCount: number;
    timestamp: string;
}

export interface PositionItem {
    id: string;
    type: "spread" | "basis";
    status: "open" | "closed";
    market_a_index: number;
    market_b_index: number | null;
    side_a: string;
    side_b: string | null;
    size_usdc: string;
    entry_price_a: string;
    entry_price_b: string | null;
    exit_price_a: string | null;
    exit_price_b: string | null;
    entry_z_score: string | null;
    exit_z_score: string | null;
    entry_funding_rate: string | null;
    realized_pnl: string | null;
    close_reason: string | null;
    opened_at: string;
    closed_at: string | null;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
}

export interface VaultHistoryPoint {
    id: string;
    total_value_usdc: string;
    lending_allocation: string;
    spread_allocation: string;
    basis_allocation: string;
    idle_allocation: string;
    lp_share_price: string;
    apy_24h: string | null;
    apy_7d: string | null;
    drawdown_from_hwm: string;
    timestamp: string;
}

// ── Metrics ──────────────────────────────────────────────────

export interface FundingRateInfo {
    marketIndex: number;
    symbol: string;
    fundingRate: number;
    fundingRateApr: number;
    oraclePrice: number;
    markPrice: number;
    lastFundingTs: number;
}

export interface FundingRateSnapshot {
    id: string;
    market_index: number;
    funding_rate: string;
    oracle_price: string;
    mark_price: string;
    timestamp: string;
}

export interface FundingRatesResponse {
    live: FundingRateInfo[] | null;
    history: FundingRateSnapshot[];
}

export interface SpreadLiveData {
    pair: string;
    priceA: number;
    priceB: number;
    ratio: number;
    zScore: number | null;
    timestamp: string;
}

export interface SpreadSnapshot {
    id: string;
    pair_name: string;
    ratio: string;
    z_score: string;
    market_a_price: string;
    market_b_price: string;
    timestamp: string;
}

export interface SpreadMetricsResponse {
    live: SpreadLiveData[] | null;
    history: SpreadSnapshot[];
}

// ── Bot ──────────────────────────────────────────────────────

export interface BotStatus {
    running: boolean;
    lastTickAt: string | null;
    lastError: { details: unknown; timestamp: string } | null;
    config: Record<string, number>;
}

export interface BotEvent {
    id: string;
    event_type: string;
    details: Record<string, unknown>;
    timestamp: string;
}

export interface BotEventsResponse {
    items: BotEvent[];
    total: number;
}
