import type { CorsOptions } from "cors";
import "dotenv/config";

import type { PerpMarketKey } from "./types/services.types";

export const BOT_CONFIG = {
    TICK_INTERVAL_MS: 30_000,
    SPREAD_ENTRY_Z_SCORE: 2.0,
    SPREAD_EXIT_Z_SCORE: 0.5,
    FUNDING_ENTRY_THRESHOLD: 0.15,
    MAX_DRAWDOWN_PCT: 0.05,
    MAX_SPREAD_ALLOCATION: 0.4,
    MAX_BASIS_ALLOCATION: 0.3,
    MIN_LENDING_ALLOCATION: 0.3,
    ZSCORE_LOOKBACK_COUNT: 2880,
    FUNDING_LOOKBACK_COUNT: 2880,
    MIN_ZSCORE_DATA_POINTS: 30,
} as const;

/** Perp market indexes on Drift */
export const PERP_MARKETS = {
    SOL: 0,
    BTC: 1,
    ETH: 2,
} as const;

/** Spot market indexes on Drift */
export const SPOT_MARKETS = {
    USDC: 0,
    SOL: 1,
    ETH: 4,
} as const;

/** Spread pairs to track for mean-reversion strategy */
export const SPREAD_PAIRS: Array<{ symbolA: PerpMarketKey; symbolB: PerpMarketKey }> = [
    { symbolA: "SOL", symbolB: "ETH" },
    { symbolA: "BTC", symbolB: "ETH" },
];

export const CORS_CONFIG = (): CorsOptions => {
    const origins: (string | RegExp)[] = [];

    if (process.env.NODE_ENV !== "production") {
        origins.push("http://localhost:3000");
        origins.push("http://127.0.0.1:3000");
        origins.push(/^https:\/\/.*\.ngrok-free\.app$/);
    }

    return {
        origin: origins,
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "Accept",
            "Origin",
            ...(process.env.NODE_ENV !== "production" ? ["ngrok-skip-browser-warning"] : []),
        ],
        exposedHeaders: ["Content-Length"],
        preflightContinue: false,
        optionsSuccessStatus: 200,
    };
};
