import type { InferEnum, InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
    bot_event_type,
    close_reason,
    funding_rate_snapshots,
    position_status,
    position_type,
    positions,
    spread_snapshots,
    strategy_layer,
    vault_snapshots,
} from "../database/schema";

export type FundingRateSnapshot = InferSelectModel<typeof funding_rate_snapshots>;
export type NewFundingRateSnapshot = InferInsertModel<typeof funding_rate_snapshots>;

export type SpreadSnapshot = InferSelectModel<typeof spread_snapshots>;
export type NewSpreadSnapshot = InferInsertModel<typeof spread_snapshots>;

export type Position = InferSelectModel<typeof positions>;
export type NewPosition = InferInsertModel<typeof positions>;

export type VaultSnapshot = InferSelectModel<typeof vault_snapshots>;
export type NewVaultSnapshot = InferInsertModel<typeof vault_snapshots>;

export type BotEventType = InferEnum<typeof bot_event_type>;
export type CloseReason = InferEnum<typeof close_reason>;
export type PositionStatus = InferEnum<typeof position_status>;
export type PositionType = InferEnum<typeof position_type>;
export type StrategyLayer = InferEnum<typeof strategy_layer>;
