import type { CorsOptions } from "cors";
import "dotenv/config";

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
            ...(process.env.NODE_ENV !== "production"
                ? ["ngrok-skip-browser-warning"]
                : []),
        ],
        exposedHeaders: ["Content-Length"],
        preflightContinue: false,
        optionsSuccessStatus: 200,
    };
};

export const BOT_CONFIG = {
    TICK_INTERVAL_MS: 30_000,
    SPREAD_ENTRY_Z_SCORE: 2.0,
    SPREAD_EXIT_Z_SCORE: 0.5,
    FUNDING_ENTRY_THRESHOLD: 0.15,
    MAX_DRAWDOWN_PCT: 0.05,
    MAX_SPREAD_ALLOCATION: 0.4,
    MAX_BASIS_ALLOCATION: 0.3,
    MIN_LENDING_ALLOCATION: 0.3,
} as const;
