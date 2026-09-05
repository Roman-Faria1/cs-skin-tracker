CREATE TYPE "public"."alert_kind" AS ENUM('price_below', 'percent_change', 'provider_spread', 'stale_data');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'paused', 'triggered');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"threshold" numeric(12, 2),
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_hash_name" text NOT NULL,
	"normalized_market_hash_name" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"supports_listings" boolean DEFAULT true NOT NULL,
	"supports_buy_orders" boolean DEFAULT false NOT NULL,
	"supports_sales" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(12, 4) DEFAULT '1' NOT NULL,
	"acquisition_price" numeric(12, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"lowest_ask" numeric(12, 2),
	"highest_bid" numeric(12, 2),
	"ask_volume" integer,
	"bid_volume" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_updated_at" timestamp with time zone,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text,
	"status" "sync_status" NOT NULL,
	"requested_item_count" integer DEFAULT 0 NOT NULL,
	"snapshots_created" integer DEFAULT 0 NOT NULL,
	"request_cost" integer DEFAULT 1 NOT NULL,
	"rate_limit_limit" integer,
	"rate_limit_remaining" integer,
	"rate_limit_reset_at" timestamp with time zone,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_provider_id_market_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."market_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_provider_id_market_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."market_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_provider_id_market_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."market_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_market_hash_name_idx" ON "items" USING btree ("market_hash_name");--> statement-breakpoint
CREATE UNIQUE INDEX "items_normalized_market_hash_name_idx" ON "items" USING btree ("normalized_market_hash_name");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_watchlist_item_idx" ON "watchlist_items" USING btree ("watchlist_id","item_id");