import { bot_events, funding_rate_snapshots, positions, spread_snapshots, vault_snapshots } from "@trident/common/database";
import { eq } from "drizzle-orm";

import { BOT_CONFIG, SPREAD_PAIRS } from "../utils/constants";
import type { AllocationProposal } from "../utils/types/services.types";
import { CapitalAllocatorService } from "./capital-allocator.service";
import { DatabaseService } from "./database.service";
import { DriftService } from "./drift.service";
import { FundingMonitorService } from "./funding-monitor.service";
import { LoggerService } from "./logger.service";
import { RiskManagerService } from "./risk-manager.service";
import { SpreadDetectorService } from "./spread-detector.service";

const logger = LoggerService.scoped("jobs");

export class JobsService {
    private static timer: ReturnType<typeof setInterval> | null = null;
    private static tickInProgress = false;
    private static collectorTickCount = 0;
    private static botTickCount = 0;

    private static readonly MAX_WARMUP_ATTEMPTS = 30;
    private static readonly WARMUP_POLL_MS = 2_000;

    // ── Lifecycle ──────────────────────────────────────────────

    static async start(): Promise<void> {
        const log = logger.scoped("init");

        // Drift connection
        log.info("drift-init", { message: "Connecting to Drift Protocol..." });
        await DriftService.init();

        // Oracle warmup
        await this.warmupOracle();

        // User account (non-fatal)
        try {
            await DriftService.initializeUserIfNeeded();
        } catch (err) {
            log.warn("init-user-failed", {
                message: "Could not initialize Drift user account — continuing with limited risk assessment",
                error: err instanceof Error ? err.message : String(err),
            });
        }

        // Account warmup
        await this.warmupAccount();

        // Start tick loop
        log.info("starting", { tickIntervalMs: BOT_CONFIG.TICK_INTERVAL_MS });
        void this.tick();
        this.timer = setInterval(() => void this.tick(), BOT_CONFIG.TICK_INTERVAL_MS);
    }

    static stop(): void {
        const log = logger.scoped("stop");
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        log.info("stopped");
    }

    // ── Tick Orchestration ─────────────────────────────────────

    private static async tick(): Promise<void> {
        if (this.tickInProgress) {
            logger.warn("tick-overlap", { message: "Previous tick still running, skipping" });
            return;
        }

        this.tickInProgress = true;
        try {
            await this.collectorTick();
            await this.botTick();
        } finally {
            this.tickInProgress = false;
        }
    }

    // ── Collector Tick ─────────────────────────────────────────

    private static async collectorTick(): Promise<void> {
        const log = logger.scoped("collector");
        const tickStart = Date.now();
        this.collectorTickCount++;

        const db = DatabaseService.getDb();
        const now = new Date().toISOString();

        try {
            const fundingCount = await this.collectFundingRates(db, now);
            const spreadCount = await this.collectSpreadPrices(db, now);

            const durationMs = Date.now() - tickStart;
            log.info("completed", {
                tick: this.collectorTickCount,
                fundingCount,
                spreadCount,
                durationMs,
            });

            await this.logBotEvent(db, "tick", {
                source: "data-collector",
                tick: this.collectorTickCount,
                fundingCount,
                spreadCount,
                durationMs,
            });
        } catch (error) {
            const durationMs = Date.now() - tickStart;
            log.error("failed", { tick: this.collectorTickCount, durationMs, error });

            await this.logBotEvent(db, "error", {
                source: "data-collector",
                tick: this.collectorTickCount,
                error: error instanceof Error ? error.message : String(error),
                durationMs,
            });
        }
    }

    // ── Bot Tick ───────────────────────────────────────────────

    private static async botTick(): Promise<void> {
        const log = logger.scoped("bot");
        const tickStart = Date.now();
        this.botTickCount++;

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

            // 4. Execute proposals (only if Drift user is funded — otherwise we'd burn SOL on failed txs)
            let executed = 0;
            const canExecute = DriftService.hasUser() && DriftService.getTotalCollateral() > 0;
            if (!canExecute) {
                const actionable = proposals.filter((p) => p.action !== "noop");
                if (actionable.length > 0) {
                    log.info("skipping-execution", {
                        reason: "Drift user not funded — observation mode only",
                        skippedActions: actionable.map((p) => p.action),
                    });
                }
            } else {
                for (const proposal of proposals) {
                    if (proposal.action === "noop") continue;
                    try {
                        await this.executeProposal(proposal, db);
                        executed++;
                    } catch (err) {
                        log.error("proposal-execution-failed", {
                            action: proposal.action,
                            reason: proposal.reason,
                            err,
                        });
                        await this.logBotEvent(db, "error", {
                            source: "bot-engine",
                            action: proposal.action,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
            }

            // 5. Vault snapshot
            await this.takeVaultSnapshot(db, riskAssessment.drawdownPct);

            // 6. Log tick
            const durationMs = Date.now() - tickStart;
            log.info("completed", {
                tick: this.botTickCount,
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

            await this.logBotEvent(db, "tick", {
                source: "bot-engine",
                tick: this.botTickCount,
                proposals: proposals.length,
                executed,
                drawdownPct: riskAssessment.drawdownPct,
                durationMs,
            });
        } catch (error) {
            const durationMs = Date.now() - tickStart;
            log.error("failed", { tick: this.botTickCount, durationMs, error });

            await this.logBotEvent(db, "error", {
                source: "bot-engine",
                tick: this.botTickCount,
                error: error instanceof Error ? error.message : String(error),
                durationMs,
            });
        }
    }

    // ── Data Collection ────────────────────────────────────────

    private static async collectFundingRates(
        db: ReturnType<typeof DatabaseService.getDb>,
        now: string,
    ): Promise<number> {
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

    private static async collectSpreadPrices(
        db: ReturnType<typeof DatabaseService.getDb>,
        now: string,
    ): Promise<number> {
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

    // ── Proposal Execution ─────────────────────────────────────

    private static async executeProposal(
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

                await this.logBotEvent(db, "open_position", {
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

                await this.logBotEvent(db, "open_position", {
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

                await this.logBotEvent(db, "close_position", {
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
                await this.logBotEvent(db, "emergency_exit", { reason: proposal.reason });
                log.warn("emergency-exit-all", { reason: proposal.reason });
                break;
            }

            case "noop":
                log.debug("noop", { reason: proposal.reason });
                break;
        }
    }

    // ── Vault Snapshot ─────────────────────────────────────────

    private static async takeVaultSnapshot(
        db: ReturnType<typeof DatabaseService.getDb>,
        drawdownPct: number,
    ): Promise<void> {
        try {
            const alloc = await RiskManagerService.getCurrentAllocations();
            const total = alloc.totalValueUsdc;

            // Skip writing empty snapshots (e.g. unfunded wallet)
            if (total <= 0) return;

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

    // ── Bot Event Logging ──────────────────────────────────────

    private static async logBotEvent(
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

    // ── Warmup ─────────────────────────────────────────────────

    private static async warmupOracle(): Promise<void> {
        const log = logger.scoped("warmup");
        log.info("oracle-waiting", { message: "Waiting for oracle data to load..." });

        for (let i = 1; i <= this.MAX_WARMUP_ATTEMPTS; i++) {
            await new Promise((r) => setTimeout(r, this.WARMUP_POLL_MS));
            try {
                DriftService.getAllFundingRates();
                DriftService.getSpreadPairPrices("SOL", "ETH");
                log.info("oracle-ready", {
                    message: "Oracle and market data available",
                    attempts: i,
                    waitedMs: i * this.WARMUP_POLL_MS,
                });
                return;
            } catch {
                log.debug("oracle-poll", {
                    message: `Oracle not ready yet (attempt ${i}/${this.MAX_WARMUP_ATTEMPTS})`,
                });
                if (i === this.MAX_WARMUP_ATTEMPTS) {
                    throw new Error("Oracle data never loaded after 60s");
                }
            }
        }
    }

    private static async warmupAccount(): Promise<void> {
        const log = logger.scoped("warmup");
        log.info("account-waiting", { message: "Waiting for account data..." });

        for (let i = 1; i <= this.MAX_WARMUP_ATTEMPTS; i++) {
            await new Promise((r) => setTimeout(r, this.WARMUP_POLL_MS));
            const collateral = DriftService.getTotalCollateral();
            if (collateral > 0 || DriftService.hasUser()) {
                log.info("account-ready", {
                    totalCollateralUsdc: collateral.toFixed(2),
                    attempts: i,
                });
                return;
            }
            if (i === this.MAX_WARMUP_ATTEMPTS) {
                log.warn("account-timeout", {
                    message: "Account data not loaded after polling — starting with safe defaults (0 collateral)",
                });
            }
        }
    }
}
