-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."bot_event_type" AS ENUM('tick', 'open_position', 'close_position', 'rebalance', 'emergency_exit', 'error');--> statement-breakpoint
CREATE TYPE "public"."close_reason" AS ENUM('target_hit', 'stop_loss', 'max_age', 'funding_flip', 'emergency_exit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."position_type" AS ENUM('spread', 'basis');--> statement-breakpoint
CREATE TYPE "public"."strategy_layer" AS ENUM('lending', 'spread', 'basis', 'idle');--> statement-breakpoint
CREATE TABLE "funding_rate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_index" integer NOT NULL,
	"funding_rate" numeric(20, 10) NOT NULL,
	"oracle_price" numeric(20, 6) NOT NULL,
	"mark_price" numeric(20, 6) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spread_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_name" varchar(32) NOT NULL,
	"ratio" numeric(20, 10) NOT NULL,
	"z_score" numeric(10, 4) NOT NULL,
	"market_a_price" numeric(20, 6) NOT NULL,
	"market_b_price" numeric(20, 6) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "position_type" NOT NULL,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"market_a_index" integer NOT NULL,
	"market_b_index" integer,
	"side_a" varchar(10) NOT NULL,
	"side_b" varchar(10),
	"size_usdc" numeric(20, 6) NOT NULL,
	"entry_price_a" numeric(20, 6) NOT NULL,
	"entry_price_b" numeric(20, 6),
	"exit_price_a" numeric(20, 6),
	"exit_price_b" numeric(20, 6),
	"entry_z_score" numeric(10, 4),
	"exit_z_score" numeric(10, 4),
	"entry_funding_rate" numeric(20, 10),
	"realized_pnl" numeric(20, 6),
	"close_reason" "close_reason",
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_value_usdc" numeric(20, 6) NOT NULL,
	"lending_allocation" numeric(10, 6) DEFAULT '0' NOT NULL,
	"spread_allocation" numeric(10, 6) DEFAULT '0' NOT NULL,
	"basis_allocation" numeric(10, 6) DEFAULT '0' NOT NULL,
	"idle_allocation" numeric(10, 6) DEFAULT '0' NOT NULL,
	"lp_share_price" numeric(20, 10) DEFAULT '1.0' NOT NULL,
	"apy_24h" numeric(10, 4),
	"apy_7d" numeric(10, 4),
	"drawdown_from_hwm" numeric(10, 6) DEFAULT '0' NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "bot_event_type" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_funding_rate_market_ts" ON "funding_rate_snapshots" USING btree ("market_index" int4_ops,"timestamp" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_spread_pair_ts" ON "spread_snapshots" USING btree ("pair_name" text_ops,"timestamp" text_ops);--> statement-breakpoint
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_positions_type" ON "positions" USING btree ("type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_vault_snapshots_ts" ON "vault_snapshots" USING btree ("timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_bot_events_ts" ON "bot_events" USING btree ("timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_bot_events_type_ts" ON "bot_events" USING btree ("event_type" timestamptz_ops,"timestamp" timestamptz_ops);
*/