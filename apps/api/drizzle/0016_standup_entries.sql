ALTER TYPE "public"."notification_type" ADD VALUE 'standup_help';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'standup_reply';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'standup_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'standup_reminder';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'standup_digest';--> statement-breakpoint
CREATE TABLE "standup_notices" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "standup_notices_group_id_user_id_date_kind_pk" PRIMARY KEY("group_id","user_id","date","kind")
);
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notification_prefs" SET DEFAULT '{"mention":true,"assigned":true,"comment":true,"status":true,"standups":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "standup_group_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "standup_date" date;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "standup_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "standup_blocker_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "standup_reply_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "standup_replies" ADD COLUMN "mention_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "standup_notices" ADD CONSTRAINT "standup_notices_group_id_standup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."standup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_notices" ADD CONSTRAINT "standup_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_standup_group_id_standup_groups_id_fk" FOREIGN KEY ("standup_group_id") REFERENCES "public"."standup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_standup_entry_id_standup_entries_id_fk" FOREIGN KEY ("standup_entry_id") REFERENCES "public"."standup_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_standup_blocker_id_standup_blockers_id_fk" FOREIGN KEY ("standup_blocker_id") REFERENCES "public"."standup_blockers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_standup_reply_id_standup_replies_id_fk" FOREIGN KEY ("standup_reply_id") REFERENCES "public"."standup_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_actor_id_created_at_idx" ON "activity" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_standup_entry_id_user_id_type_idx" ON "notifications" USING btree ("standup_entry_id","user_id","type");--> statement-breakpoint
CREATE INDEX "notifications_standup_group_id_idx" ON "notifications" USING btree ("standup_group_id");--> statement-breakpoint
CREATE INDEX "standup_blockers_open_task_id_idx" ON "standup_blockers" USING btree ("task_id") WHERE "standup_blockers"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "standup_entries_group_id_date_idx" ON "standup_entries" USING btree ("group_id","date");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_check" CHECK ("notifications"."task_id" is not null or "notifications"."standup_group_id" is not null);--> statement-breakpoint
-- Everyone starts with standup notifications on (the Settings switch reads the key).
UPDATE "users" SET "notification_prefs" = '{"standups":true}'::jsonb || "notification_prefs" WHERE NOT ("notification_prefs" ? 'standups');
