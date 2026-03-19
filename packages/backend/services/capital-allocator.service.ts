import { positions } from "@trident/common/database";
import type { FundingSignal, Position, SpreadSignal } from "@trident/common/types";
import { and, eq } from "drizzle-orm";

import { BOT_CONFIG, PERP_MARKETS } from "../utils/constants";
import type {
    AllocationProposal,
    PerpMarketKey,
    RiskAssessment,
} from "../utils/types/services.types";
import { DatabaseService } from "./database.service";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("capital-allocator");

export class CapitalAllocatorService {
    /**
     * Given current signals and risk assessment, produce proposals
     * for the bot-engine to execute. Never executes trades directly.
     */
    static async allocate(
        spreadSignals: SpreadSignal[],
        fundingSignals: FundingSignal[],
        riskAssessment: RiskAssessment,
    ): Promise<AllocationProposal[]> {
        const now = new Date().toISOString();

        logger.debug("allocate-start", {
            spreadSignals: spreadSignals.length,
            fundingSignals: fundingSignals.length,
            emergency: riskAssessment.emergencyExit,
            canOpenSpread: riskAssessment.canOpenSpread,
            canOpenBasis: riskAssessment.canOpenBasis,
        });

        // 1. Emergency — close everything
        if (riskAssessment.emergencyExit) {
            const proposals = await this.buildEmergencyProposals(riskAssessment, now);
            logger.warn("emergency-proposals", {
                count: proposals.length,
                reason: riskAssessment.emergencyReason,
            });
            return proposals;
        }

        const proposals: AllocationProposal[] = [];

        // 2. Risk-mandated closures (stop-loss, max-age)
        for (const order of riskAssessment.positionsToClose) {
            logger.info("risk-closure", {
                positionId: order.positionId,
                reason: order.reason,
                markets: order.marketIndexes,
            });
            proposals.push({
                action: "close_spread",
                closeParams: order,
                reason: `Risk: ${order.reason}`,
                riskAssessment,
                timestamp: now,
            });
        }

        // 3. Spread signals
        const spreadProposals = await this.evaluateSpreadSignals(spreadSignals, riskAssessment, now);
        proposals.push(...spreadProposals);

        // 4. Funding signals
        const fundingProposals = await this.evaluateFundingSignals(fundingSignals, riskAssessment, now);
        proposals.push(...fundingProposals);

        if (proposals.length === 0) {
            logger.debug("no-action", { reason: "No opportunities or actions needed" });
            proposals.push({
                action: "noop",
                reason: "No opportunities or actions needed",
                riskAssessment,
                timestamp: now,
            });
        }

        logger.info("allocate-complete", {
            proposalCount: proposals.length,
            actions: proposals.map((p) => p.action),
        });

        return proposals;
    }

    // ── Emergency ────────────────────────────────────────────

    private static async buildEmergencyProposals(
        riskAssessment: RiskAssessment,
        now: string,
    ): Promise<AllocationProposal[]> {
        const db = DatabaseService.getDb();
        const openPositions = await db
            .select()
            .from(positions)
            .where(eq(positions.status, "open"));

        const proposals: AllocationProposal[] = openPositions.map((pos) => {
            const marketIndexes = [pos.market_a_index];
            if (pos.market_b_index !== null) marketIndexes.push(pos.market_b_index);

            return {
                action: pos.type === "spread" ? "close_spread" : "close_basis",
                closeParams: {
                    positionId: pos.id,
                    reason: "emergency_exit" as const,
                    marketIndexes,
                },
                reason: riskAssessment.emergencyReason ?? "Emergency exit",
                riskAssessment,
                timestamp: now,
            };
        });

        proposals.push({
            action: "emergency_exit_all",
            reason: riskAssessment.emergencyReason ?? "Emergency exit",
            riskAssessment,
            timestamp: now,
        });

        return proposals;
    }

    // ── Spread Signals ───────────────────────────────────────

    private static async evaluateSpreadSignals(
        signals: SpreadSignal[],
        risk: RiskAssessment,
        now: string,
    ): Promise<AllocationProposal[]> {
        const proposals: AllocationProposal[] = [];

        for (const signal of signals) {
            if (signal.action === "hold") continue;

            if (signal.action === "exit") {
                const existing = await this.findOpenSpreadPosition(signal.pair);
                if (!existing) {
                    logger.debug("spread-exit-no-position", { pair: signal.pair });
                    continue;
                }

                const marketIndexes = [existing.market_a_index];
                if (existing.market_b_index !== null) marketIndexes.push(existing.market_b_index);

                proposals.push({
                    action: "close_spread",
                    closeParams: {
                        positionId: existing.id,
                        reason: "target_hit",
                        marketIndexes,
                    },
                    reason: `Spread ${signal.pair} z=${signal.zScore.toFixed(2)} reverted to exit zone`,
                    riskAssessment: risk,
                    timestamp: now,
                });
                continue;
            }

            // enter_short or enter_long
            if (!risk.canOpenSpread) {
                logger.debug("spread-entry-blocked", {
                    pair: signal.pair,
                    action: signal.action,
                    reason: "Risk manager blocked new spread positions",
                });
                continue;
            }

            if (signal.confidence < BOT_CONFIG.CONFIDENCE_THRESHOLD) {
                logger.debug("spread-low-confidence", {
                    pair: signal.pair,
                    confidence: signal.confidence.toFixed(3),
                    threshold: BOT_CONFIG.CONFIDENCE_THRESHOLD,
                });
                continue;
            }

            const existing = await this.findOpenSpreadPosition(signal.pair);
            if (existing) {
                logger.debug("spread-already-open", { pair: signal.pair, positionId: existing.id });
                continue;
            }

            const sizeUsdc = this.sizePosition(risk.maxNewSpreadUsdc, signal.confidence);
            if (sizeUsdc < BOT_CONFIG.MIN_POSITION_SIZE_USDC) {
                logger.debug("spread-size-too-small", {
                    pair: signal.pair,
                    sizeUsdc: sizeUsdc.toFixed(2),
                    minRequired: BOT_CONFIG.MIN_POSITION_SIZE_USDC,
                });
                continue;
            }

            const { marketAIndex, marketBIndex } = this.resolvePairMarkets(signal.pair);
            const isShort = signal.action === "enter_short";

            proposals.push({
                action: "open_spread",
                openParams: {
                    type: "spread",
                    marketAIndex,
                    marketBIndex,
                    sideA: isShort ? "short" : "long",
                    sideB: isShort ? "long" : "short",
                    sizeUsdc,
                    entryZScore: signal.zScore,
                },
                reason: `Spread ${signal.pair} z=${signal.zScore.toFixed(2)} confidence=${signal.confidence.toFixed(2)}`,
                riskAssessment: risk,
                timestamp: now,
            });

            logger.info("spread-proposal", {
                pair: signal.pair,
                action: signal.action,
                sizeUsdc: sizeUsdc.toFixed(2),
                zScore: signal.zScore.toFixed(4),
                confidence: signal.confidence.toFixed(3),
            });
        }

        return proposals;
    }

    // ── Funding Signals ──────────────────────────────────────

    private static async evaluateFundingSignals(
        signals: FundingSignal[],
        risk: RiskAssessment,
        now: string,
    ): Promise<AllocationProposal[]> {
        const proposals: AllocationProposal[] = [];

        for (const signal of signals) {
            if (signal.action === "hold") continue;

            if (signal.action === "exit_basis") {
                const existing = await this.findOpenBasisPosition(signal.marketIndex);
                if (!existing) {
                    logger.debug("basis-exit-no-position", { symbol: signal.symbol });
                    continue;
                }

                proposals.push({
                    action: "close_basis",
                    closeParams: {
                        positionId: existing.id,
                        reason: "funding_flip",
                        marketIndexes: [existing.market_a_index],
                    },
                    reason: `Funding flip on ${signal.symbol}, APR=${signal.fundingRateApr.toFixed(2)}%`,
                    riskAssessment: risk,
                    timestamp: now,
                });
                continue;
            }

            // enter_basis
            if (!risk.canOpenBasis) {
                logger.debug("basis-entry-blocked", {
                    symbol: signal.symbol,
                    reason: "Risk manager blocked new basis positions",
                });
                continue;
            }

            const existing = await this.findOpenBasisPosition(signal.marketIndex);
            if (existing) {
                logger.debug("basis-already-open", { symbol: signal.symbol, positionId: existing.id });
                continue;
            }

            const sizeUsdc = this.sizePosition(risk.maxNewBasisUsdc, 1.0);
            if (sizeUsdc < BOT_CONFIG.MIN_POSITION_SIZE_USDC) {
                logger.debug("basis-size-too-small", {
                    symbol: signal.symbol,
                    sizeUsdc: sizeUsdc.toFixed(2),
                    minRequired: BOT_CONFIG.MIN_POSITION_SIZE_USDC,
                });
                continue;
            }

            proposals.push({
                action: "open_basis",
                openParams: {
                    type: "basis",
                    marketAIndex: signal.marketIndex,
                    sideA: signal.fundingRateApr > 0 ? "short" : "long",
                    sizeUsdc,
                    entryFundingRate: signal.fundingRateApr,
                },
                reason: `Basis on ${signal.symbol}, APR=${signal.fundingRateApr.toFixed(2)}%`,
                riskAssessment: risk,
                timestamp: now,
            });

            logger.info("basis-proposal", {
                symbol: signal.symbol,
                sizeUsdc: sizeUsdc.toFixed(2),
                fundingRateApr: signal.fundingRateApr.toFixed(4),
            });
        }

        return proposals;
    }

    // ── Helpers ──────────────────────────────────────────────

    private static resolvePairMarkets(pair: string): { marketAIndex: number; marketBIndex: number } {
        const [a, b] = pair.split("/") as [PerpMarketKey, PerpMarketKey];
        return {
            marketAIndex: PERP_MARKETS[a],
            marketBIndex: PERP_MARKETS[b],
        };
    }

    private static sizePosition(maxUsdc: number, confidence: number): number {
        const base = maxUsdc * 0.5;
        return Math.min(base * confidence, maxUsdc);
    }

    private static async findOpenSpreadPosition(pair: string): Promise<Position | null> {
        const { marketAIndex, marketBIndex } = this.resolvePairMarkets(pair);
        const db = DatabaseService.getDb();

        const [row] = await db
            .select()
            .from(positions)
            .where(
                and(
                    eq(positions.status, "open"),
                    eq(positions.type, "spread"),
                    eq(positions.market_a_index, marketAIndex),
                    eq(positions.market_b_index, marketBIndex),
                ),
            )
            .limit(1);

        return row ?? null;
    }

    private static async findOpenBasisPosition(marketIndex: number): Promise<Position | null> {
        const db = DatabaseService.getDb();

        const [row] = await db
            .select()
            .from(positions)
            .where(
                and(
                    eq(positions.status, "open"),
                    eq(positions.type, "basis"),
                    eq(positions.market_a_index, marketIndex),
                ),
            )
            .limit(1);

        return row ?? null;
    }
}
