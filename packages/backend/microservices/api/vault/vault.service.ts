import { positions, vault_snapshots } from "@trident/common/database";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../../services/database.service";
import { LoggerService } from "../../../services/logger.service";
import { RangerVaultService } from "../../../services/ranger-vault.service";
import { isDriftAvailable } from "../utils";

import type { PaginationParams, TimeRangeParams } from "../utils";

const logger = LoggerService.scoped("vaultService");

export const getVaultState = async () => {
    const log = logger.scoped("getVaultState");
    log.info("fetching-vault-state");

    const db = DatabaseService.getDb();

    // DB snapshot is the historical baseline — always loaded
    const [latestSnapshot] = await db
        .select()
        .from(vault_snapshots)
        .orderBy(desc(vault_snapshots.timestamp))
        .limit(1);

    const [posCount] = await db
        .select({ count: count() })
        .from(positions)
        .where(eq(positions.status, "open"));

    // Build base response from DB history
    const snapshotTvl = latestSnapshot ? Number(latestSnapshot.total_value_usdc) : 0;
    const snapshotAllocations = latestSnapshot
        ? {
              totalValueUsdc: snapshotTvl,
              lendingUsdc: Number(latestSnapshot.lending_allocation) * snapshotTvl,
              spreadUsdc: Number(latestSnapshot.spread_allocation) * snapshotTvl,
              basisUsdc: Number(latestSnapshot.basis_allocation) * snapshotTvl,
              idleUsdc: Number(latestSnapshot.idle_allocation) * snapshotTvl,
          }
        : null;

    const base = {
        live: false,
        totalValueUsdc: snapshotTvl,
        freeCollateral: 0,
        leverage: 0,
        allocations: snapshotAllocations,
        apy24h: latestSnapshot ? Number(latestSnapshot.apy_24h) : null,
        apy7d: latestSnapshot ? Number(latestSnapshot.apy_7d) : null,
        drawdownPct: latestSnapshot ? Number(latestSnapshot.drawdown_from_hwm) : 0,
        healthRate: 0,
        activePositionCount: posCount.count,
        timestamp: new Date().toISOString(),
    };

    // Overlay live on-chain vault data when funded
    if (RangerVaultService.isAvailable()) {
        try {
            const vaultState = await RangerVaultService.getVaultState();
            log.info("vault-on-chain", { totalValue: vaultState.totalValue });

            if (vaultState.totalValue > 0) {
                base.live = true;
                base.totalValueUsdc = vaultState.totalValue;
                base.allocations = {
                    totalValueUsdc: vaultState.totalValue,
                    lendingUsdc: 0,
                    spreadUsdc: 0,
                    basisUsdc: 0,
                    idleUsdc: vaultState.totalValue,
                };
            }
        } catch (error) {
            log.warn("vault-on-chain-error", { error: String(error) });
        }
    }

    // Overlay live Drift data when funded
    if (!base.live && await isDriftAvailable()) {
        try {
            const { DriftService } = await import("../../../services/drift.service");
            const { RiskManagerService } = await import("../../../services/risk-manager.service");

            const totalValue = DriftService.getTotalCollateral();
            const risk = await RiskManagerService.assess();

            if (totalValue > 0) {
                base.live = true;
                base.totalValueUsdc = totalValue;
                base.freeCollateral = DriftService.getFreeCollateral();
                base.leverage = DriftService.getLeverage();
                base.allocations = await RiskManagerService.getCurrentAllocations();
                base.drawdownPct = risk.drawdownPct;
            }

            base.healthRate = risk.healthRate;
        } catch (error) {
            log.warn("drift-error", { error: String(error) });
        }
    }

    return base;
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
