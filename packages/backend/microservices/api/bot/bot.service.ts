import { bot_events } from "@trident/common/database";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../../services/database.service";
import { LoggerService } from "../../../services/logger.service";
import { BOT_CONFIG } from "../../../utils/constants";

import type { PaginationParams, TimeRangeParams } from "../utils";

const logger = LoggerService.scoped("botService");

export const getBotStatus = async () => {
    const log = logger.scoped("getBotStatus");
    log.info("fetching-bot-status");

    const db = DatabaseService.getDb();

    // Get latest tick event to infer running state
    const [lastTick] = await db
        .select()
        .from(bot_events)
        .where(eq(bot_events.event_type, "tick"))
        .orderBy(desc(bot_events.timestamp))
        .limit(1);

    // Get latest error event
    const [lastError] = await db
        .select()
        .from(bot_events)
        .where(eq(bot_events.event_type, "error"))
        .orderBy(desc(bot_events.timestamp))
        .limit(1);

    // Bot is "running" if last tick was within 2x tick interval
    const running = lastTick
        ? Date.now() - new Date(lastTick.timestamp).getTime() < BOT_CONFIG.TICK_INTERVAL_MS * 2
        : false;

    return {
        running,
        lastTickAt: lastTick?.timestamp ?? null,
        lastError: lastError
            ? { details: lastError.details, timestamp: lastError.timestamp }
            : null,
        config: BOT_CONFIG,
    };
};

export const getBotEvents = async (
    filters: { eventType?: string },
    timeRange: TimeRangeParams,
    pagination: PaginationParams,
) => {
    const log = logger.scoped("getBotEvents");
    log.info("fetching-bot-events", { filters, pagination });

    const db = DatabaseService.getDb();

    const conditions = [
        gte(bot_events.timestamp, timeRange.from.toISOString()),
        lte(bot_events.timestamp, timeRange.to.toISOString()),
    ];

    if (filters.eventType) {
        conditions.push(
            eq(bot_events.event_type, filters.eventType as "tick" | "open_position" | "close_position" | "rebalance" | "emergency_exit" | "error"),
        );
    }

    const where = and(...conditions);

    const [items, [total]] = await Promise.all([
        db
            .select()
            .from(bot_events)
            .where(where)
            .orderBy(desc(bot_events.timestamp))
            .limit(pagination.limit)
            .offset(pagination.offset),
        db.select({ count: count() }).from(bot_events).where(where),
    ]);

    return { items, total: total.count };
};
