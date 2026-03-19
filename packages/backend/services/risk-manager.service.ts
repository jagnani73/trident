import { positions, vault_snapshots } from "@trident/common/database";
import type { Position } from "@trident/common/types";
import { eq, sql } from "drizzle-orm";

import { BOT_CONFIG } from "../utils/constants";
import type {
    CurrentAllocations,
    PositionCloseOrder,
    RiskAssessment,
} from "../utils/types/services.types";
import { DatabaseService } from "./database.service";
import { DriftService } from "./drift.service";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("risk-manager");

export class RiskManagerService {
    private static lastEmergencyExitAt: number | null = null;

    /** Run full risk assessment. Called once per bot tick before allocation. */
    static async assess(): Promise<RiskAssessment> {
        const totalValue = DriftService.getTotalCollateral();
        const freeCollateral = DriftService.getFreeCollateral();
        const healthRate = totalValue > 0 ? freeCollateral / totalValue : 1;

        const drawdownPct = await this.getDrawdownFromHwm(totalValue);
        const openPositions = await this.getOpenPositions();
        const allocations = this.computeAllocations(totalValue, openPositions);
        const positionsToClose = this.checkPositionLimits(openPositions);

        // Emergency conditions
        let emergencyExit = false;
        let emergencyReason: string | null = null;

        if (drawdownPct > BOT_CONFIG.MAX_DRAWDOWN_PCT) {
            emergencyExit = true;
            emergencyReason = `Drawdown ${(drawdownPct * 100).toFixed(2)}% exceeds ${BOT_CONFIG.MAX_DRAWDOWN_PCT * 100}% limit`;
        } else if (healthRate < BOT_CONFIG.HEALTH_RATE_FLOOR) {
            emergencyExit = true;
            emergencyReason = `Health rate ${healthRate.toFixed(3)} below ${BOT_CONFIG.HEALTH_RATE_FLOOR} floor`;
        }

        if (emergencyExit) {
            this.lastEmergencyExitAt = Date.now();
            logger.warn("emergency-exit", { emergencyReason, drawdownPct, healthRate });
        }

        const inCooldown = this.isInCooldown();
        const canOpen = !emergencyExit && !inCooldown;

        const maxNewSpreadUsdc = canOpen
            ? Math.max(0, totalValue * BOT_CONFIG.MAX_SPREAD_ALLOCATION - allocations.spreadUsdc)
            : 0;
        const maxNewBasisUsdc = canOpen
            ? Math.max(0, totalValue * BOT_CONFIG.MAX_BASIS_ALLOCATION - allocations.basisUsdc)
            : 0;

        return {
            emergencyExit,
            emergencyReason,
            canOpenSpread: canOpen && maxNewSpreadUsdc >= BOT_CONFIG.MIN_POSITION_SIZE_USDC,
            canOpenBasis: canOpen && maxNewBasisUsdc >= BOT_CONFIG.MIN_POSITION_SIZE_USDC,
            maxNewSpreadUsdc,
            maxNewBasisUsdc,
            positionsToClose,
            drawdownPct,
            healthRate,
            timestamp: new Date().toISOString(),
        };
    }

    /** Get current allocation breakdown. Public for API use. */
    static async getCurrentAllocations(): Promise<CurrentAllocations> {
        const totalValue = DriftService.getTotalCollateral();
        const openPositions = await this.getOpenPositions();
        return this.computeAllocations(totalValue, openPositions);
    }

    // ── Internal Helpers ─────────────────────────────────────

    private static computeAllocations(totalValue: number, openPositions: Position[]): CurrentAllocations {
        let spreadUsdc = 0;
        let basisUsdc = 0;

        for (const pos of openPositions) {
            const size = parseFloat(pos.size_usdc);
            if (pos.type === "spread") spreadUsdc += size;
            else if (pos.type === "basis") basisUsdc += size;
        }

        const idleUsdc = DriftService.getFreeCollateral();
        const lendingUsdc = Math.max(0, totalValue - spreadUsdc - basisUsdc - idleUsdc);

        return { totalValueUsdc: totalValue, lendingUsdc, spreadUsdc, basisUsdc, idleUsdc };
    }

    private static async getDrawdownFromHwm(currentTotal: number): Promise<number> {
        const db = DatabaseService.getDb();

        const [row] = await db
            .select({ maxValue: sql<string>`max(${vault_snapshots.total_value_usdc})` })
            .from(vault_snapshots);

        const historicalHwm = row?.maxValue ? parseFloat(row.maxValue) : 0;
        const hwm = Math.max(historicalHwm, currentTotal);

        if (hwm === 0) return 0;
        return (hwm - currentTotal) / hwm;
    }

    private static checkPositionLimits(openPositions: Position[]): PositionCloseOrder[] {
        const toClose: PositionCloseOrder[] = [];
        const now = Date.now();

        for (const pos of openPositions) {
            const sizeUsdc = parseFloat(pos.size_usdc);
            const marketIndexes = [pos.market_a_index];
            if (pos.market_b_index !== null) marketIndexes.push(pos.market_b_index);

            // Check unrealized PnL for stop-loss
            const posInfo = DriftService.getPositionInfo(pos.market_a_index);
            if (posInfo && sizeUsdc > 0) {
                const lossPct = -posInfo.unrealizedPnl / sizeUsdc;
                if (lossPct > BOT_CONFIG.POSITION_STOP_LOSS_PCT) {
                    toClose.push({ positionId: pos.id, reason: "stop_loss", marketIndexes });
                    logger.info("stop-loss-triggered", {
                        positionId: pos.id,
                        lossPct: (lossPct * 100).toFixed(2),
                    });
                    continue;
                }
            }

            // Check max age
            const openedAt = new Date(pos.opened_at).getTime();
            if (now - openedAt > BOT_CONFIG.MAX_POSITION_AGE_MS) {
                toClose.push({ positionId: pos.id, reason: "max_age", marketIndexes });
                logger.info("max-age-triggered", {
                    positionId: pos.id,
                    ageMs: now - openedAt,
                });
            }
        }

        return toClose;
    }

    private static async getOpenPositions(): Promise<Position[]> {
        const db = DatabaseService.getDb();
        return db
            .select()
            .from(positions)
            .where(eq(positions.status, "open"));
    }

    private static isInCooldown(): boolean {
        if (this.lastEmergencyExitAt === null) return false;
        return Date.now() - this.lastEmergencyExitAt < BOT_CONFIG.EMERGENCY_COOLDOWN_MS;
    }
}
