import { spread_snapshots } from "@trident/common/database";
import type { SpreadSignal, SpreadSignalAction } from "@trident/common/types";
import { mean, zScore } from "@trident/common/utils";
import { desc, eq } from "drizzle-orm";

import { BOT_CONFIG, SPREAD_PAIRS } from "../utils/constants";
import { DatabaseService } from "./database.service";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("spread-detector");

export class SpreadDetectorService {
    /** Evaluate all configured spread pairs. Returns one signal per pair. */
    static async evaluateAll(): Promise<SpreadSignal[]> {
        logger.debug("evaluate-all-start", { pairCount: SPREAD_PAIRS.length });
        const signals: SpreadSignal[] = [];

        for (const { symbolA, symbolB } of SPREAD_PAIRS) {
            const pairName = `${symbolA}/${symbolB}`;
            try {
                const signal = await this.evaluatePair(pairName);
                signals.push(signal);
            } catch (error) {
                logger.error("evaluate-pair-failed", { pairName, error });
            }
        }

        return signals;
    }

    /** Evaluate a single pair: compute z-score, update DB, return signal. */
    static async evaluatePair(pairName: string): Promise<SpreadSignal> {
        const db = DatabaseService.getDb();

        const rows = await db
            .select({
                id: spread_snapshots.id,
                ratio: spread_snapshots.ratio,
            })
            .from(spread_snapshots)
            .where(eq(spread_snapshots.pair_name, pairName))
            .orderBy(desc(spread_snapshots.timestamp))
            .limit(BOT_CONFIG.ZSCORE_LOOKBACK_COUNT);

        const ratios = rows.map((r) => parseFloat(r.ratio));
        const latestRatio = ratios[0] ?? 0;
        const latestId = rows[0]?.id;

        const hasEnoughData = ratios.length >= BOT_CONFIG.MIN_ZSCORE_DATA_POINTS;
        const z = hasEnoughData ? zScore(latestRatio, ratios) : null;

        const meanRatio = mean(ratios);
        const confidence = Math.min(1, ratios.length / BOT_CONFIG.ZSCORE_LOOKBACK_COUNT);
        const action = this.resolveAction(z);

        logger.debug("evaluated", {
            pairName,
            dataPoints: ratios.length,
            hasEnoughData,
            latestRatio: latestRatio.toFixed(6),
            meanRatio: meanRatio.toFixed(6),
            zScore: z?.toFixed(4) ?? "null",
            confidence: confidence.toFixed(3),
            action,
        });

        // Write computed z-score back to the latest snapshot row
        if (latestId && z !== null) {
            await db
                .update(spread_snapshots)
                .set({ z_score: z.toFixed(4) })
                .where(eq(spread_snapshots.id, latestId));
        }

        const signal: SpreadSignal = {
            pair: pairName,
            action,
            zScore: z ?? 0,
            ratio: latestRatio,
            meanRatio,
            confidence,
            timestamp: new Date().toISOString(),
        };

        if (action !== "hold") {
            logger.info("signal", signal);
        }

        return signal;
    }

    private static resolveAction(z: number | null): SpreadSignalAction {
        if (z === null) return "hold";
        if (z >= BOT_CONFIG.SPREAD_ENTRY_Z_SCORE) return "enter_short";
        if (z <= -BOT_CONFIG.SPREAD_ENTRY_Z_SCORE) return "enter_long";
        if (Math.abs(z) <= BOT_CONFIG.SPREAD_EXIT_Z_SCORE) return "exit";
        return "hold";
    }
}
