import { positions, vault_snapshots } from "@trident/common/database";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../../services/database.service";
import { LoggerService } from "../../../services/logger.service";
import { isDriftAvailable } from "../utils";

import type { PaginationParams, TimeRangeParams } from "../utils";

const logger = LoggerService.scoped("vaultService");

export const getVaultState = async () => {
    const log = logger.scoped("getVaultState");
    log.info("fetching-vault-state");

    const db = DatabaseService.getDb();

    // Always get latest DB snapshot for APY/historical data
    const [latestSnapshot] = await db
        .select()
        .from(vault_snapshots)
        .orderBy(desc(vault_snapshots.timestamp))
        .limit(1);

    // Count active positions
    const [posCount] = await db
        .select({ count: count() })
        .from(positions)
        .where(eq(positions.status, "open"));

    // Try live Drift data
    if (await isDriftAvailable()) {
        try {
            const { DriftService } = await import("../../../services/drift.service");
            const { RiskManagerService } = await import("../../../services/risk-manager.service");

            const totalValue = DriftService.getTotalCollateral();
            const freeCollateral = DriftService.getFreeCollateral();
            const leverage = DriftService.getLeverage();
            const risk = await RiskManagerService.assess();

            // If wallet is funded, use live allocations; otherwise fall back to DB snapshot
            const useLive = totalValue > 0;
            const allocations = useLive
                ? await RiskManagerService.getCurrentAllocations()
                : latestSnapshot
                  ? {
                        totalValueUsdc: Number(latestSnapshot.total_value_usdc),
                        lendingUsdc: Number(latestSnapshot.lending_allocation) * Number(latestSnapshot.total_value_usdc),
                        spreadUsdc: Number(latestSnapshot.spread_allocation) * Number(latestSnapshot.total_value_usdc),
                        basisUsdc: Number(latestSnapshot.basis_allocation) * Number(latestSnapshot.total_value_usdc),
                        idleUsdc: Number(latestSnapshot.idle_allocation) * Number(latestSnapshot.total_value_usdc),
                    }
                  : null;

            return {
                live: useLive,
                totalValueUsdc: useLive ? totalValue : (latestSnapshot ? Number(latestSnapshot.total_value_usdc) : 0),
                freeCollateral,
                leverage,
                allocations,
                apy24h: latestSnapshot ? Number(latestSnapshot.apy_24h) : null,
                apy7d: latestSnapshot ? Number(latestSnapshot.apy_7d) : null,
                drawdownPct: useLive ? risk.drawdownPct : (latestSnapshot ? Number(latestSnapshot.drawdown_from_hwm) : 0),
                healthRate: risk.healthRate,
                activePositionCount: posCount.count,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            log.warn("drift-fallback", { error: String(error) });
        }
    }

    // DB-only fallback
    return {
        live: false,
        totalValueUsdc: latestSnapshot ? Number(latestSnapshot.total_value_usdc) : 0,
        freeCollateral: 0,
        leverage: 0,
        allocations: latestSnapshot
            ? {
                  totalValueUsdc: Number(latestSnapshot.total_value_usdc),
                  lendingUsdc: Number(latestSnapshot.lending_allocation) * Number(latestSnapshot.total_value_usdc),
                  spreadUsdc: Number(latestSnapshot.spread_allocation) * Number(latestSnapshot.total_value_usdc),
                  basisUsdc: Number(latestSnapshot.basis_allocation) * Number(latestSnapshot.total_value_usdc),
                  idleUsdc: Number(latestSnapshot.idle_allocation) * Number(latestSnapshot.total_value_usdc),
              }
            : null,
        apy24h: latestSnapshot ? Number(latestSnapshot.apy_24h) : null,
        apy7d: latestSnapshot ? Number(latestSnapshot.apy_7d) : null,
        drawdownPct: latestSnapshot ? Number(latestSnapshot.drawdown_from_hwm) : 0,
        healthRate: 0,
        activePositionCount: posCount.count,
        timestamp: new Date().toISOString(),
    };
};

export const getPositions = async (
    filters: {
        status?: "open" | "closed";
        type?: "spread" | "basis";
    },
    pagination: PaginationParams,
) => {
    const log = logger.scoped("getPositions");
    log.info("fetching-positions", { filters, pagination });

    const db = DatabaseService.getDb();

    const conditions = [];
    if (filters.status) conditions.push(eq(positions.status, filters.status));
    if (filters.type) conditions.push(eq(positions.type, filters.type));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [total]] = await Promise.all([
        db
            .select()
            .from(positions)
            .where(where)
            .orderBy(desc(positions.opened_at))
            .limit(pagination.limit)
            .offset(pagination.offset),
        db.select({ count: count() }).from(positions).where(where),
    ]);

    return { items, total: total.count };
};

export const getVaultHistory = async (timeRange: TimeRangeParams, limit: number) => {
    const log = logger.scoped("getVaultHistory");
    log.info("fetching-history", { timeRange, limit });

    const db = DatabaseService.getDb();

    const rows = await db
        .select()
        .from(vault_snapshots)
        .where(
            and(
                gte(vault_snapshots.timestamp, timeRange.from.toISOString()),
                lte(vault_snapshots.timestamp, timeRange.to.toISOString()),
            ),
        )
        .orderBy(vault_snapshots.timestamp)
        .limit(limit);

    return rows;
};
