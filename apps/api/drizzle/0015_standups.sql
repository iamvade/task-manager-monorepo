CREATE TYPE "public"."speaking_order" AS ENUM('posting_order', 'alphabetical', 'random');--> statement-breakpoint
CREATE TYPE "public"."standup_entry_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."standup_reaction" AS ENUM('thumbs_up', 'eyes', 'heart');--> statement-breakpoint
CREATE TABLE "user_absences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_absences_dates_check" CHECK ("user_absences"."end_date" >= "user_absences"."start_date")
);
--> statement-breakpoint
CREATE TABLE "standup_blockers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"text" text NOT NULL,
	"task_id" uuid,
	"helper_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standup_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"yesterday" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"today" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "standup_entry_status" DEFAULT 'draft' NOT NULL,
	"posted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standup_entries_group_id_user_id_date_unique" UNIQUE("group_id","user_id","date")
);
--> statement-breakpoint
CREATE TABLE "standup_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	CONSTRAINT "standup_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "standup_group_members_group_id_position_unique" UNIQUE("group_id","position")
);
--> statement-breakpoint
CREATE TABLE "standup_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ulaanbaatar' NOT NULL,
	"days" smallint[] DEFAULT '{0,1,2,3,4}'::smallint[] NOT NULL,
	"post_by" time DEFAULT '10:00' NOT NULL,
	"reminder_at" time DEFAULT '09:30',
	"meeting_at" time DEFAULT '10:15',
	"facilitator_id" uuid,
	"speaking_order" "speaking_order" DEFAULT 'posting_order' NOT NULL,
	"seconds_per_person" integer DEFAULT 120 NOT NULL,
	"total_meeting_minutes" integer DEFAULT 15 NOT NULL,
	"show_blockers_first" boolean DEFAULT true NOT NULL,
	"mark_linked_tasks_blocked" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "standup_groups_days_check" CHECK (cardinality("standup_groups"."days") > 0 and "standup_groups"."days" <@ '{0,1,2,3,4,5,6}'::smallint[])
);
--> statement-breakpoint
CREATE TABLE "standup_meeting_tasks" (
	"meeting_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "standup_meeting_tasks_meeting_id_task_id_pk" PRIMARY KEY("meeting_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "standup_meetings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"facilitator_id" uuid,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"notes" jsonb,
	"speaking_order" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"durations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "standup_meetings_group_id_date_unique" UNIQUE("group_id","date")
);
--> statement-breakpoint
CREATE TABLE "standup_reactions" (
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" "standup_reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standup_reactions_entry_id_user_id_emoji_pk" PRIMARY KEY("entry_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "standup_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"blocker_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_absences" ADD CONSTRAINT "user_absences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_absences" ADD CONSTRAINT "user_absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_blockers" ADD CONSTRAINT "standup_blockers_entry_id_standup_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."standup_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_blockers" ADD CONSTRAINT "standup_blockers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_blockers" ADD CONSTRAINT "standup_blockers_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_entries" ADD CONSTRAINT "standup_entries_group_id_standup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."standup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_entries" ADD CONSTRAINT "standup_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_group_members" ADD CONSTRAINT "standup_group_members_group_id_standup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."standup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_group_members" ADD CONSTRAINT "standup_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_groups" ADD CONSTRAINT "standup_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_groups" ADD CONSTRAINT "standup_groups_facilitator_id_users_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_groups" ADD CONSTRAINT "standup_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_meeting_id_standup_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."standup_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meeting_tasks" ADD CONSTRAINT "standup_meeting_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD CONSTRAINT "standup_meetings_group_id_standup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."standup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_meetings" ADD CONSTRAINT "standup_meetings_facilitator_id_users_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_reactions" ADD CONSTRAINT "standup_reactions_entry_id_standup_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."standup_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_reactions" ADD CONSTRAINT "standup_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_replies" ADD CONSTRAINT "standup_replies_entry_id_standup_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."standup_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_replies" ADD CONSTRAINT "standup_replies_blocker_id_standup_blockers_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."standup_blockers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_replies" ADD CONSTRAINT "standup_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_absences_user_id_end_date_idx" ON "user_absences" USING btree ("user_id","end_date");--> statement-breakpoint
CREATE INDEX "standup_blockers_entry_id_idx" ON "standup_blockers" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "standup_blockers_task_id_idx" ON "standup_blockers" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "standup_group_members_user_id_idx" ON "standup_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "standup_groups_workspace_id_idx" ON "standup_groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "standup_replies_entry_id_idx" ON "standup_replies" USING btree ("entry_id");--> statement-breakpoint
-- Out of office moves from workspace_members.away_until/away_note to user_absences. A current or
-- future away_until becomes one absence from today through that date; if a person was away in
-- several workspaces, the latest date wins (absences are per person, not per workspace).
INSERT INTO "user_absences" ("id", "user_id", "start_date", "end_date", "note", "created_at")
SELECT kite_uuidv7(), a.user_id, LEAST(current_date, a.away_until), a.away_until, a.away_note, now()
FROM (
	SELECT DISTINCT ON (wm.user_id) wm.user_id, wm.away_until, wm.away_note
	FROM "workspace_members" wm
	WHERE wm.away_until IS NOT NULL AND wm.away_until >= current_date
	ORDER BY wm.user_id, wm.away_until DESC
) a;--> statement-breakpoint
ALTER TABLE "workspace_members" DROP COLUMN "away_until";--> statement-breakpoint
ALTER TABLE "workspace_members" DROP COLUMN "away_note";