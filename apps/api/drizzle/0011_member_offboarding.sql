ALTER TABLE "workspace_members" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "deactivated_by" uuid;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "away_until" date;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "away_note" text;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_deactivated_by_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;