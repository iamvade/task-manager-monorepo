ALTER TABLE "projects" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description_text" text DEFAULT '' NOT NULL;