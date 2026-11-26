ALTER TABLE "standup_meetings" DROP CONSTRAINT "standup_meetings_current_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "standup_groups" DROP COLUMN "meeting_at";--> statement-breakpoint
ALTER TABLE "standup_groups" DROP COLUMN "speaking_order";--> statement-breakpoint
ALTER TABLE "standup_groups" DROP COLUMN "seconds_per_person";--> statement-breakpoint
ALTER TABLE "standup_groups" DROP COLUMN "total_meeting_minutes";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "started_at";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "ended_at";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "notes_saved_at";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "speaking_order";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "current_user_id";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "current_started_at";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "durations";--> statement-breakpoint
ALTER TABLE "standup_meetings" DROP COLUMN "total_seconds";--> statement-breakpoint
DROP TYPE "public"."speaking_order";