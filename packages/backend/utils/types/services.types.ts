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
