CREATE INDEX "price_snapshots_latest_idx" ON "price_snapshots" USING btree ("item_id","provider_id","collected_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_runs_budget_idx" ON "sync_runs" USING btree ("provider_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_cooldown_idx" ON "sync_runs" USING btree ("provider_id","item_id","started_at");