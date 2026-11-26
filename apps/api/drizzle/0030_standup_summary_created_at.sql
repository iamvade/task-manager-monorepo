-- Standup live mode is gone: a standup_meetings row is now a day's meeting summary, made on the
-- first write. Existing rows keep their notes and tasks; created_at comes from when they started.
ALTER TABLE "standup_meetings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "standup_meetings" SET "created_at" = coalesce("started_at", "updated_at");
