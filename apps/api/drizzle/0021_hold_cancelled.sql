ALTER TYPE "public"."status_category" ADD VALUE 'on_hold' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."status_category" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_closed_at_idx" ON "tasks" USING btree ("closed_at");--> statement-breakpoint
-- Every closed task so far is done. The new default statuses are added by ensureDefaultStatuses
-- after the migrations run (an enum value can't be used in the transaction that adds it).
UPDATE "tasks" SET "closed_at" = "completed_at" WHERE "completed_at" IS NOT NULL;
