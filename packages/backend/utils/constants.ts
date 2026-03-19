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
    POSITION_STOP_LOSS_PCT: 0.03,
    MAX_SINGLE_MARKET_EXPOSURE_PCT: 0.5,
    HEALTH_RATE_FLOOR: 1.20,
    EMERGENCY_COOLDOWN_MS: 15 * 60_000,
    MAX_POSITION_AGE_MS: 24 * 60 * 60_000,
    MIN_POSITION_SIZE_USDC: 10,
    CONFIDENCE_THRESHOLD: 0.5,
    REBALANCE_DRIFT_PCT: 0.05,
    DRY_RUN: true,
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

/** Ranger vault (Voltr) program IDs and addresses */
export const VAULT_CONFIG = {
    PROGRAM_ID: "vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8",
    DRIFT_ADAPTOR_PROGRAM_ID: "EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP",
    LENDING_ADAPTOR_PROGRAM_ID: "aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz",
    USDC_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    /** Drift state account on mainnet */
    DRIFT_STATE: "5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN",
    /** Drift program ID */
    DRIFT_PROGRAM_ID: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    /** USDC oracle on Drift */
    USDC_ORACLE: "9VCioxmni2gDLv11qufWzT3RDERhQE4iY5Gf7NTfYyAV",
    /** USDC spot market index on Drift */
    USDC_SPOT_MARKET_INDEX: 0,
} as const;

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
