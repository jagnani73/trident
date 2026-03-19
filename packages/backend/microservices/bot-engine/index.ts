import { bot_events, positions, vault_snapshots } from "@trident/common/database";
import { eq } from "drizzle-orm";
import "dotenv/config";

import { CapitalAllocatorService } from "../../services/capital-allocator.service";
import { DatabaseService } from "../../services/database.service";
import { DriftService } from "../../services/drift.service";
import { FundingMonitorService } from "../../services/funding-monitor.service";
import { LoggerService } from "../../services/logger.service";
import { RiskManagerService } from "../../services/risk-manager.service";
import { SpreadDetectorService } from "../../services/spread-detector.service";
import { BOT_CONFIG } from "../../utils/constants";
import type { AllocationProposal } from "../../utils/types/services.types";

const logger = LoggerService.scoped("bot-engine");

let tickTimer: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;
let tickCount = 0;

// ── Proposal Execution ──────────────────────────────────────

async function executeProposal(
    proposal: AllocationProposal,
    db: ReturnType<typeof DatabaseService.getDb>,
): Promise<void> {
    const log = logger.scoped("execute");

    switch (proposal.action) {
        case "open_spread": {
            const p = proposal.openParams!;
            const priceA = DriftService.getOraclePriceNumber(p.marketAIndex);
            const priceB = DriftService.getOraclePriceNumber(p.marketBIndex!);
            const halfUsdc = p.sizeUsdc / 2;
            const sizeBaseA = priceA > 0 ? halfUsdc / priceA : 0;
            const sizeBaseB = priceB > 0 ? halfUsdc / priceB : 0;

            await logBotEvent(db, "open_position", {
                type: "spread",
                marketA: p.marketAIndex,
                marketB: p.marketBIndex,
                sideA: p.sideA,
                sideB: p.sideB,
                sizeUsdc: p.sizeUsdc,
            });

            await DriftService.placePerpMarketOrder(p.marketAIndex, p.sideA, sizeBaseA);
            await DriftService.placePerpMarketOrder(p.marketBIndex!, p.sideB!, sizeBaseB);

            await db.insert(positions).values({
                type: "spread",
                status: "open",
                market_a_index: p.marketAIndex,
                market_b_index: p.marketBIndex,
                side_a: p.sideA,
                side_b: p.sideB,
                size_usdc: p.sizeUsdc.toFixed(6),
                entry_price_a: priceA.toFixed(6),
                entry_price_b: priceB.toFixed(6),
                entry_z_score: p.entryZScore?.toFixed(4),
                opened_at: new Date().toISOString(),
            });

            log.info("opened-spread", { marketA: p.marketAIndex, marketB: p.marketBIndex, sizeUsdc: p.sizeUsdc });
            break;
        }

        case "open_basis": {
            const p = proposal.openParams!;
            const price = DriftService.getOraclePriceNumber(p.marketAIndex);
            const sizeBase = price > 0 ? p.sizeUsdc / price : 0;

            await logBotEvent(db, "open_position", {
                type: "basis",
                marketA: p.marketAIndex,
                sideA: p.sideA,
                sizeUsdc: p.sizeUsdc,
            });

            await DriftService.placePerpMarketOrder(p.marketAIndex, p.sideA, sizeBase);

            await db.insert(positions).values({
                type: "basis",
                status: "open",
                market_a_index: p.marketAIndex,
                side_a: p.sideA,
                size_usdc: p.sizeUsdc.toFixed(6),
                entry_price_a: price.toFixed(6),
                entry_funding_rate: p.entryFundingRate?.toFixed(10),
                opened_at: new Date().toISOString(),
            });

            log.info("opened-basis", { marketA: p.marketAIndex, sizeUsdc: p.sizeUsdc });
            break;
        }

        case "close_spread":
        case "close_basis": {
            const c = proposal.closeParams!;

            await logBotEvent(db, "close_position", {
                positionId: c.positionId,
                reason: c.reason,
                markets: c.marketIndexes,
            });

            // Capture PnL before closing
            let realizedPnl = 0;
            for (const mi of c.marketIndexes) {
                const info = DriftService.getPositionInfo(mi);
                if (info) realizedPnl += info.unrealizedPnl;
            }

            // Close on-chain positions
            for (const mi of c.marketIndexes) {
                await DriftService.closePosition(mi);
            }

            // Get exit prices
            const exitPriceA = DriftService.getOraclePriceNumber(c.marketIndexes[0]);
            const exitPriceB = c.marketIndexes[1] !== undefined
                ? DriftService.getOraclePriceNumber(c.marketIndexes[1])
                : undefined;

            await db
                .update(positions)
                .set({
                    status: "closed",
                    close_reason: c.reason,
                    exit_price_a: exitPriceA.toFixed(6),
                    exit_price_b: exitPriceB?.toFixed(6),
                    realized_pnl: realizedPnl.toFixed(6),
                    closed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .where(eq(positions.id, c.positionId));

            log.info("closed-position", {
                positionId: c.positionId,
                reason: c.reason,
                realizedPnl,
            });
            break;
        }

        case "emergency_exit_all": {
            await DriftService.cancelAllOrders();
            await logBotEvent(db, "emergency_exit", { reason: proposal.reason });
            log.warn("emergency-exit-all", { reason: proposal.reason });
            break;
        }

        case "noop":
            log.debug("noop", { reason: proposal.reason });
            break;
    }
}

// ── Vault Snapshot ──────────────────────────────────────────

async function takeVaultSnapshot(
    db: ReturnType<typeof DatabaseService.getDb>,
    drawdownPct: number,
): Promise<void> {
    try {
        const alloc = await RiskManagerService.getCurrentAllocations();
        const total = alloc.totalValueUsdc;

        await db.insert(vault_snapshots).values({
            total_value_usdc: total.toFixed(6),
            lending_allocation: total > 0 ? (alloc.lendingUsdc / total).toFixed(6) : "0",
            spread_allocation: total > 0 ? (alloc.spreadUsdc / total).toFixed(6) : "0",
            basis_allocation: total > 0 ? (alloc.basisUsdc / total).toFixed(6) : "0",
            idle_allocation: total > 0 ? (alloc.idleUsdc / total).toFixed(6) : "0",
            drawdown_from_hwm: drawdownPct.toFixed(6),
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error("vault-snapshot-failed", { err });
    }
}

// ── Bot Event Logging ───────────────────────────────────────

async function logBotEvent(
    db: ReturnType<typeof DatabaseService.getDb>,
    eventType: "tick" | "open_position" | "close_position" | "rebalance" | "emergency_exit" | "error",
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

// ── Tick Logic ──────────────────────────────────────────────

async function runTick(): Promise<void> {
    const log = logger.scoped("tick");
    const tickStart = Date.now();
    tickCount++;

    const db = DatabaseService.getDb();

    try {
        // 1. Gather signals
        const spreadSignals = await SpreadDetectorService.evaluateAll();
        const fundingSignals = await FundingMonitorService.evaluateAll();

        // 2. Risk assessment
        const riskAssessment = await RiskManagerService.assess();

        // 3. Capital allocation
        const proposals = await CapitalAllocatorService.allocate(
            spreadSignals,
            fundingSignals,
            riskAssessment,
        );

        // 4. Execute proposals
        let executed = 0;
        for (const proposal of proposals) {
            if (proposal.action === "noop") continue;
            try {
                await executeProposal(proposal, db);
                executed++;
            } catch (err) {
                log.error("proposal-execution-failed", {
                    action: proposal.action,
                    reason: proposal.reason,
                    err,
                });
                await logBotEvent(db, "error", {
                    source: "bot-engine",
                    action: proposal.action,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // 5. Vault snapshot
        await takeVaultSnapshot(db, riskAssessment.drawdownPct);

        // 6. Log tick
        const durationMs = Date.now() - tickStart;
        log.info("completed", {
            tick: tickCount,
            spreads: spreadSignals.map((s) => ({
                pair: s.pair,
                action: s.action,
                z: s.zScore.toFixed(2),
                confidence: s.confidence.toFixed(2),
            })),
            fundings: fundingSignals.map((f) => ({
                symbol: f.symbol,
                action: f.action,
                apr: f.fundingRateApr.toFixed(2),
                flip: f.isFlip,
            })),
            risk: {
                emergency: riskAssessment.emergencyExit,
                drawdown: (riskAssessment.drawdownPct * 100).toFixed(2),
                health: riskAssessment.healthRate.toFixed(3),
                canSpread: riskAssessment.canOpenSpread,
                canBasis: riskAssessment.canOpenBasis,
            },
            proposals: proposals.map((p) => p.action),
            executed,
            durationMs,
        });

        await logBotEvent(db, "tick", {
            source: "bot-engine",
            tick: tickCount,
            proposals: proposals.length,
            executed,
            drawdownPct: riskAssessment.drawdownPct,
            durationMs,
        });
    } catch (error) {
        const durationMs = Date.now() - tickStart;
        log.error("failed", { tick: tickCount, durationMs, error });

        await logBotEvent(db, "error", {
            source: "bot-engine",
            tick: tickCount,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
        });
    }
}

// ── Loop Scheduling ─────────────────────────────────────────

function scheduleNextTick(): void {
    if (isShuttingDown) return;
    tickTimer = setTimeout(async () => {
        await runTick();
        logger.info("next-tick", { message: `Sleeping ${BOT_CONFIG.TICK_INTERVAL_MS / 1000}s...` });
        scheduleNextTick();
    }, BOT_CONFIG.TICK_INTERVAL_MS);
}

// ── Lifecycle ───────────────────────────────────────────────

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

    // Warmup: wait for oracle data
    const MAX_WARMUP_ATTEMPTS = 30;
    const WARMUP_POLL_MS = 2_000;
    log.info("warming-up", { message: "Waiting for oracle data to load..." });

    // Phase 1: Wait for oracle + market data (same as data-collector)
    for (let i = 1; i <= MAX_WARMUP_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, WARMUP_POLL_MS));
        try {
            DriftService.getAllFundingRates();
            DriftService.getSpreadPairPrices("SOL", "ETH");
            log.info("warmup-oracle-ready", {
                message: "Oracle and market data available",
                attempts: i,
                waitedMs: i * WARMUP_POLL_MS,
            });
            break;
        } catch {
            log.debug("warmup-poll", {
                message: `Oracle not ready yet (attempt ${i}/${MAX_WARMUP_ATTEMPTS})`,
            });
            if (i === MAX_WARMUP_ATTEMPTS) {
                log.error("warmup-timeout", { message: "Oracle data never loaded after 60s, exiting" });
                process.exit(1);
            }
        }
    }

    // Phase 2: Ensure Drift user account exists on-chain, then wait for account data
    log.info("warmup-account", { message: "Ensuring Drift user account exists..." });
    try {
        await DriftService.initializeUserIfNeeded();
    } catch (err) {
        log.warn("init-user-failed", {
            message: "Could not initialize Drift user account — continuing with limited risk assessment",
            error: err instanceof Error ? err.message : String(err),
        });
    }

    // Give BulkAccountLoader time to pick up the (possibly new) user account
    for (let i = 1; i <= MAX_WARMUP_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, WARMUP_POLL_MS));
        const collateral = DriftService.getTotalCollateral();
        if (collateral > 0 || DriftService.hasUser()) {
            log.info("warmup-account-ready", {
                totalCollateralUsdc: collateral.toFixed(2),
                attempts: i,
            });
            break;
        }
        if (i === MAX_WARMUP_ATTEMPTS) {
            log.warn("warmup-account-timeout", {
                message: "Account data not loaded after polling — starting with safe defaults (0 collateral)",
            });
        }
    }

    log.info("ready", { tickIntervalMs: BOT_CONFIG.TICK_INTERVAL_MS });
    log.info("first-tick", { message: "Running first bot tick..." });
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

// ── Entry Point ─────────────────────────────────────────────

process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

start();
