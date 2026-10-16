CREATE TYPE "public"."meeting_task_source" AS ENUM('today', 'blocker');--> statement-breakpoint
ALTER TABLE "standup_meetings" ALTER COLUMN "notes" SET DATA TYPE text USING "notes" #>> '{}';--> statement-breakpoint
ALTER TABLE "standup_group_members" ADD COLUMN "added_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "source_user_id" uuid;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "source_kind" "meeting_task_source" NOT NULL;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "source_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "source_blocker_id" uuid;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "source_item_index" smallint;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD COLUMN "notes_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD COLUMN "current_user_id" uuid;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD COLUMN "current_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD COLUMN "total_seconds" integer;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_source_entry_id_standup_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."standup_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_source_blocker_id_standup_blockers_id_fk" FOREIGN KEY ("source_blocker_id") REFERENCES "public"."standup_blockers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD CONSTRAINT "standup_meetings_current_user_id_users_id_fk" FOREIGN KEY ("current_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standup_meeting_tasks_task_id_idx" ON "standup_meeting_tasks" USING btree ("task_id");--> statement-breakpoint
-- Members already in a group count as there since the group was created.
UPDATE "standup_group_members" m SET "added_at" = g."created_at" FROM "standup_groups" g WHERE g."id" = m."group_id";
