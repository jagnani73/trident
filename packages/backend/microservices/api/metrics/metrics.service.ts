import { funding_rate_snapshots, spread_snapshots } from "@trident/common/database";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../../services/database.service";
import { LoggerService } from "../../../services/logger.service";
import { SPREAD_PAIRS } from "../../../utils/constants";
import { isDriftAvailable } from "../utils";

import type { PaginationParams, TimeRangeParams } from "../utils";

const logger = LoggerService.scoped("metricsService");

export const getFundingRates = async (
    filters: { live?: boolean; marketIndex?: number },
    timeRange: TimeRangeParams,
    pagination: PaginationParams,
) => {
    const log = logger.scoped("getFundingRates");
    log.info("fetching-funding-rates", { filters });

    let live = null;

    // Live funding rates from Drift
    if (filters.live !== false && (await isDriftAvailable())) {
        try {
            const { DriftService } = await import("../../../services/drift.service");
            live = DriftService.getAllFundingRates();
        } catch (error) {
            log.warn("drift-live-fallback", { error: String(error) });
        }
    }

    // Historical from DB
    const db = DatabaseService.getDb();
    const conditions = [
        gte(funding_rate_snapshots.timestamp, timeRange.from.toISOString()),
        lte(funding_rate_snapshots.timestamp, timeRange.to.toISOString()),
    ];

    if (filters.marketIndex !== undefined) {
        conditions.push(eq(funding_rate_snapshots.market_index, filters.marketIndex));
    }

    const history = await db
        .select()
        .from(funding_rate_snapshots)
        .where(and(...conditions))
        .orderBy(desc(funding_rate_snapshots.timestamp))
        .limit(pagination.limit)
        .offset(pagination.offset);

    return { live, history };
};

export const getSpreadMetrics = async (
    filters: { live?: boolean; pair?: string },
    timeRange: TimeRangeParams,
    pagination: PaginationParams,
) => {
    const log = logger.scoped("getSpreadMetrics");
    log.info("fetching-spread-metrics", { filters });

    let live = null;

    // Live spread prices from Drift
    if (filters.live !== false && (await isDriftAvailable())) {
        try {
            const { DriftService } = await import("../../../services/drift.service");
            const db = DatabaseService.getDb();

            live = await Promise.all(
                SPREAD_PAIRS.map(async ({ symbolA, symbolB }) => {
                    const pairName = `${symbolA}/${symbolB}`;
                    const prices = DriftService.getSpreadPairPrices(symbolA, symbolB);

                    // Get latest z-score from DB for this pair
                    const [latestSnap] = await db
                        .select()
                        .from(spread_snapshots)
                        .where(eq(spread_snapshots.pair_name, pairName))
                        .orderBy(desc(spread_snapshots.timestamp))
                        .limit(1);

                    return {
                        ...prices,
                        zScore: latestSnap ? Number(latestSnap.z_score) : null,
                        timestamp: new Date().toISOString(),
                    };
                }),
            );
        } catch (error) {
            log.warn("drift-live-fallback", { error: String(error) });
        }
    }

    // Historical from DB
    const db = DatabaseService.getDb();
    const conditions = [
        gte(spread_snapshots.timestamp, timeRange.from.toISOString()),
        lte(spread_snapshots.timestamp, timeRange.to.toISOString()),
    ];

    if (filters.pair) {
        conditions.push(eq(spread_snapshots.pair_name, filters.pair));
    }

    const history = await db
        .select()
        .from(spread_snapshots)
        .where(and(...conditions))
        .orderBy(desc(spread_snapshots.timestamp))
        .limit(pagination.limit)
        .offset(pagination.offset);

    return { live, history };
};
