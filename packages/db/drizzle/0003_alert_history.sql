CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid,
	"item_id" uuid,
	"market_hash_name" text NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"generation" integer NOT NULL,
	"threshold" numeric(12, 2) NOT NULL,
	"provider_id" text,
	"observed_value" numeric(24, 6) NOT NULL,
	"message" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "armed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "baseline_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_evaluation" text;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_generation_idx" ON "alert_events" USING btree ("alert_id","generation");--> statement-breakpoint
CREATE INDEX "alert_events_history_idx" ON "alert_events" USING btree ("triggered_at" DESC NULLS LAST,"id" DESC NULLS LAST);