import { bot_events, funding_rate_snapshots, spread_snapshots } from "@trident/common/database";

import { DatabaseService } from "../../services/database.service";
import { DriftService } from "../../services/drift.service";
import { LoggerService } from "../../services/logger.service";
import { BOT_CONFIG, SPREAD_PAIRS } from "../../utils/constants";
import "dotenv/config";

const logger = LoggerService.scoped("data-collector");

let tickTimer: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;
let tickCount = 0;

// ── Tick Logic ─────────────────────────────────────────────────

async function collectFundingRates(db: ReturnType<typeof DatabaseService.getDb>, now: string): Promise<number> {
    const rates = DriftService.getAllFundingRates();

    const rows = rates.map((r) => ({
        market_index: r.marketIndex,
        funding_rate: r.fundingRate.toFixed(10),
        oracle_price: r.oraclePrice.toFixed(6),
        mark_price: r.markPrice.toFixed(6),
        timestamp: now,
    }));

    await db.insert(funding_rate_snapshots).values(rows);
    return rows.length;
}

async function collectSpreadPrices(db: ReturnType<typeof DatabaseService.getDb>, now: string): Promise<number> {
    const rows = SPREAD_PAIRS.map(({ symbolA, symbolB }) => {
        const prices = DriftService.getSpreadPairPrices(symbolA, symbolB);
        return {
            pair_name: prices.pair,
            ratio: prices.ratio.toFixed(10),
            z_score: "0.0000", // sentinel — spread detector computes real z-scores
            market_a_price: prices.priceA.toFixed(6),
            market_b_price: prices.priceB.toFixed(6),
            timestamp: now,
        };
    });

    await db.insert(spread_snapshots).values(rows);
    return rows.length;
}

async function logBotEvent(
    db: ReturnType<typeof DatabaseService.getDb>,
    eventType: "tick" | "error",
    details: Record<string, unknown>,
): Promise<void> {
    try {
        await db.insert(bot_events).values({
            event_type: eventType,
            details,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error("bot-event-insert-failed", { err });
    }
}

async function runTick(): Promise<void> {
    const log = logger.scoped("tick");
    const tickStart = Date.now();
    tickCount++;

    const db = DatabaseService.getDb();
    const now = new Date().toISOString();

    try {
        const fundingCount = await collectFundingRates(db, now);
        const spreadCount = await collectSpreadPrices(db, now);

        const durationMs = Date.now() - tickStart;
        log.info("completed", { tick: tickCount, fundingCount, spreadCount, durationMs });

        await logBotEvent(db, "tick", {
            source: "data-collector",
            tick: tickCount,
            fundingCount,
            spreadCount,
            durationMs,
        });
    } catch (error) {
        const durationMs = Date.now() - tickStart;
        log.error("failed", { tick: tickCount, durationMs, error });

        await logBotEvent(db, "error", {
            source: "data-collector",
            tick: tickCount,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
        });
    }
}

// ── Loop Scheduling ────────────────────────────────────────────

function scheduleNextTick(): void {
    if (isShuttingDown) return;
    tickTimer = setTimeout(async () => {
        await runTick();
        logger.info("next-tick", { message: `Sleeping ${BOT_CONFIG.TICK_INTERVAL_MS / 1000}s...` });
        scheduleNextTick();
    }, BOT_CONFIG.TICK_INTERVAL_MS);
}

// ── Lifecycle ──────────────────────────────────────────────────

async function start(): Promise<void> {
    const log = logger.scoped("init");

    try {
        log.info("db-init", { message: "Connecting to database..." });
        await DatabaseService.init();
        log.info("drift-init", { message: "Connecting to Drift Protocol..." });
        await DriftService.init();
    } catch (error) {
        log.error("fatal-startup-error", { error });
        process.exit(1);
    }

    // Poll until oracle data is actually available (BulkAccountLoader needs time)
    const MAX_WARMUP_ATTEMPTS = 30;
    const WARMUP_POLL_MS = 2_000;
    log.info("warming-up", { message: "Waiting for oracle data to load..." });

    for (let i = 1; i <= MAX_WARMUP_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, WARMUP_POLL_MS));
        try {
            // Test the full funding rate calculation — needs oracle + TWAP data
            DriftService.getAllFundingRates();
            DriftService.getSpreadPairPrices("SOL", "ETH");
            log.info("warmup-done", { message: "Market data available", attempts: i, waitedMs: i * WARMUP_POLL_MS });
            break;
        } catch {
            log.debug("warmup-poll", { message: `Oracle not ready yet (attempt ${i}/${MAX_WARMUP_ATTEMPTS})` });
            if (i === MAX_WARMUP_ATTEMPTS) {
                log.error("warmup-timeout", { message: "Oracle data never loaded after 60s, exiting" });
                process.exit(1);
            }
        }
    }

    log.info("ready", { tickIntervalMs: BOT_CONFIG.TICK_INTERVAL_MS });
    log.info("first-tick", { message: "Running first data collection..." });
    await runTick();
    log.info("scheduling", { message: `Next tick in ${BOT_CONFIG.TICK_INTERVAL_MS / 1000}s` });
    scheduleNextTick();
}

function shutdown(): void {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const log = logger.scoped("shutdown");
    log.info("shutting-down");

    if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
    }

    DriftService.shutdown()
        .catch((err: unknown) => log.error("drift-shutdown-error", { err }))
        .finally(() => {
            log.info("shutdown-complete");
            process.exit(0);
        });
}

// ── Entry Point ────────────────────────────────────────────────

process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

start();
