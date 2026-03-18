import { pgTable, index, uuid, integer, numeric, timestamp, varchar, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const bot_event_type = pgEnum("bot_event_type", ['tick', 'open_position', 'close_position', 'rebalance', 'emergency_exit', 'error'])
export const close_reason = pgEnum("close_reason", ['target_hit', 'stop_loss', 'max_age', 'funding_flip', 'emergency_exit', 'manual'])
export const position_status = pgEnum("position_status", ['open', 'closed'])
export const position_type = pgEnum("position_type", ['spread', 'basis'])
export const strategy_layer = pgEnum("strategy_layer", ['lending', 'spread', 'basis', 'idle'])


export const funding_rate_snapshots = pgTable("funding_rate_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	market_index: integer().notNull(),
	funding_rate: numeric({ precision: 20, scale:  10 }).notNull(),
	oracle_price: numeric({ precision: 20, scale:  6 }).notNull(),
	mark_price: numeric({ precision: 20, scale:  6 }).notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_funding_rate_market_ts").using("btree", table.market_index.asc().nullsLast().op("int4_ops"), table.timestamp.desc().nullsFirst().op("int4_ops")),
]);

export const spread_snapshots = pgTable("spread_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pair_name: varchar({ length: 32 }).notNull(),
	ratio: numeric({ precision: 20, scale:  10 }).notNull(),
	z_score: numeric({ precision: 10, scale:  4 }).notNull(),
	market_a_price: numeric({ precision: 20, scale:  6 }).notNull(),
	market_b_price: numeric({ precision: 20, scale:  6 }).notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_spread_pair_ts").using("btree", table.pair_name.asc().nullsLast().op("text_ops"), table.timestamp.desc().nullsFirst().op("text_ops")),
]);

export const positions = pgTable("positions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	type: position_type().notNull(),
	status: position_status().default('open').notNull(),
	market_a_index: integer().notNull(),
	market_b_index: integer(),
	side_a: varchar({ length: 10 }).notNull(),
	side_b: varchar({ length: 10 }),
	size_usdc: numeric({ precision: 20, scale:  6 }).notNull(),
	entry_price_a: numeric({ precision: 20, scale:  6 }).notNull(),
	entry_price_b: numeric({ precision: 20, scale:  6 }),
	exit_price_a: numeric({ precision: 20, scale:  6 }),
	exit_price_b: numeric({ precision: 20, scale:  6 }),
	entry_z_score: numeric({ precision: 10, scale:  4 }),
	exit_z_score: numeric({ precision: 10, scale:  4 }),
	entry_funding_rate: numeric({ precision: 20, scale:  10 }),
	realized_pnl: numeric({ precision: 20, scale:  6 }),
	close_reason: close_reason(),
	opened_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closed_at: timestamp({ withTimezone: true, mode: 'string' }),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_positions_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("idx_positions_type").using("btree", table.type.asc().nullsLast().op("enum_ops")),
]);

export const vault_snapshots = pgTable("vault_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	total_value_usdc: numeric({ precision: 20, scale:  6 }).notNull(),
	lending_allocation: numeric({ precision: 10, scale:  6 }).default('0').notNull(),
	spread_allocation: numeric({ precision: 10, scale:  6 }).default('0').notNull(),
	basis_allocation: numeric({ precision: 10, scale:  6 }).default('0').notNull(),
	idle_allocation: numeric({ precision: 10, scale:  6 }).default('0').notNull(),
	lp_share_price: numeric({ precision: 20, scale:  10 }).default('1.0').notNull(),
	apy_24h: numeric({ precision: 10, scale:  4 }),
	apy_7d: numeric({ precision: 10, scale:  4 }),
	drawdown_from_hwm: numeric({ precision: 10, scale:  6 }).default('0').notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_vault_snapshots_ts").using("btree", table.timestamp.desc().nullsFirst().op("timestamptz_ops")),
]);

export const bot_events = pgTable("bot_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	event_type: bot_event_type().notNull(),
	details: jsonb().default({}).notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_bot_events_ts").using("btree", table.timestamp.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_bot_events_type_ts").using("btree", table.event_type.asc().nullsLast().op("timestamptz_ops"), table.timestamp.desc().nullsFirst().op("timestamptz_ops")),
]);
