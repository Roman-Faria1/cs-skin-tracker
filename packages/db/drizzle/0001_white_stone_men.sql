ALTER TABLE "sync_runs" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "market_hash_name" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "response_status" integer;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;