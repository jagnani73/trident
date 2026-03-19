import type { CloseReason, PositionType } from "@trident/common/types";

import type { PERP_MARKETS, SPOT_MARKETS } from "../constants";

export type PerpMarketKey = keyof typeof PERP_MARKETS;
export type SpotMarketKey = keyof typeof SPOT_MARKETS;

export interface FundingRateInfo {
    marketIndex: number;
    symbol: string;
    fundingRate: number;
    fundingRateApr: number;
    oraclePrice: number;
    markPrice: number;
    lastFundingTs: number;
}

export interface SpreadPairPrices {
    pair: string;
    priceA: number;
    priceB: number;
    ratio: number;
}

export interface PositionInfo {
    marketIndex: number;
    baseAmount: number;
    quoteAmount: number;
    unrealizedPnl: number;
    isLong: boolean;
}

// ── Risk Manager Types ─────────────────────────────────────────

export interface CurrentAllocations {
    totalValueUsdc: number;
    lendingUsdc: number;
    spreadUsdc: number;
    basisUsdc: number;
    idleUsdc: number;
}

export interface RiskAssessment {
    emergencyExit: boolean;
    emergencyReason: string | null;
    canOpenSpread: boolean;
    canOpenBasis: boolean;
    maxNewSpreadUsdc: number;
    maxNewBasisUsdc: number;
    positionsToClose: PositionCloseOrder[];
    drawdownPct: number;
    healthRate: number;
    timestamp: string;
}

export interface PositionCloseOrder {
    positionId: string;
    reason: CloseReason;
    marketIndexes: number[];
}

// ── Capital Allocator Types ────────────────────────────────────

export type ProposalAction =
    | "open_spread"
    | "close_spread"
    | "open_basis"
    | "close_basis"
    | "deposit_lending"
    | "withdraw_lending"
    | "emergency_exit_all"
    | "noop";

export interface LendingRebalanceParams {
    amountUsdc: number;
}

export interface AllocationProposal {
    action: ProposalAction;
    openParams?: OpenPositionParams;
    closeParams?: ClosePositionParams;
    lendingParams?: LendingRebalanceParams;
    reason: string;
    riskAssessment: RiskAssessment;
    timestamp: string;
}

export interface OpenPositionParams {
    type: PositionType;
    marketAIndex: number;
    marketBIndex?: number;
    sideA: "long" | "short";
    sideB?: "long" | "short";
    sizeUsdc: number;
    entryZScore?: number;
    entryFundingRate?: number;
}

export interface ClosePositionParams {
    positionId: string;
    reason: CloseReason;
    marketIndexes: number[];
}
