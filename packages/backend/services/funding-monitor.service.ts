import { funding_rate_snapshots } from "@trident/common/database";
import type { FundingSignal, FundingSignalAction } from "@trident/common/types";
import { mean } from "@trident/common/utils";
import { desc, eq } from "drizzle-orm";

import { BOT_CONFIG, PERP_MARKETS } from "../utils/constants";
import { DatabaseService } from "./database.service";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("funding-monitor");

/** Threshold as a percentage (FUNDING_ENTRY_THRESHOLD is 0.15 = 15%) */
const ENTRY_APR_PCT = BOT_CONFIG.FUNDING_ENTRY_THRESHOLD * 100;

export class FundingMonitorService {
    /** Evaluate all perp markets. Returns one signal per market. */
    static async evaluateAll(): Promise<FundingSignal[]> {
        const signals: FundingSignal[] = [];

        for (const [symbol, marketIndex] of Object.entries(PERP_MARKETS)) {
            try {
                const signal = await this.evaluateMarket(marketIndex, symbol);
                signals.push(signal);
            } catch (error) {
                logger.error("evaluate-market-failed", { symbol, marketIndex, error });
            }
        }

        return signals;
    }

    /** Evaluate a single market's funding rate signal. */
    static async evaluateMarket(marketIndex: number, symbol: string): Promise<FundingSignal> {
        const db = DatabaseService.getDb();

        const rows = await db
            .select({
                funding_rate: funding_rate_snapshots.funding_rate,
                oracle_price: funding_rate_snapshots.oracle_price,
            })
            .from(funding_rate_snapshots)
            .where(eq(funding_rate_snapshots.market_index, marketIndex))
            .orderBy(desc(funding_rate_snapshots.timestamp))
            .limit(BOT_CONFIG.FUNDING_LOOKBACK_COUNT);

        const aprs = rows.map((r) => {
            const rate = parseFloat(r.funding_rate);
            const price = parseFloat(r.oracle_price);
            return price > 0 ? (rate / price) * 24 * 365 * 100 : 0;
        });

        const currentApr = aprs[0] ?? 0;
        const previousApr = aprs[1] ?? 0;
        const avgApr = mean(aprs);

        const isFlip = previousApr !== 0 && Math.sign(currentApr) !== Math.sign(previousApr);
        const action = this.resolveAction(currentApr, isFlip);

        const signal: FundingSignal = {
            marketIndex,
            symbol,
            action,
            fundingRateApr: currentApr,
            avgFundingRateApr: avgApr,
            isFlip,
            timestamp: new Date().toISOString(),
        };

        if (action !== "hold") {
            logger.info("signal", signal);
        }

        return signal;
    }

    private static resolveAction(currentApr: number, isFlip: boolean): FundingSignalAction {
        // Funding flipped and no longer above threshold — exit
        if (isFlip && Math.abs(currentApr) < ENTRY_APR_PCT) return "exit_basis";
        // Strong funding in stable direction — enter
        if (Math.abs(currentApr) >= ENTRY_APR_PCT && !isFlip) return "enter_basis";
        // Otherwise hold
        return "hold";
    }
}
