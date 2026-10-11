CREATE TYPE "public"."task_size" AS ENUM('S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE TABLE "sprint_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"sprint_id" uuid NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"added_by" uuid NOT NULL,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "task_status_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"status_id" uuid,
	"category" "status_category" NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"exited_at" timestamp with time zone,
	"entered_by" uuid NOT NULL,
	"exited_by" uuid
);
--> statement-breakpoint
CREATE TABLE "workspace_holidays" (
	"workspace_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "workspace_holidays_workspace_id_date_pk" PRIMARY KEY("workspace_id","date")
);
--> statement-breakpoint
DROP INDEX "sprints_project_id_idx";--> statement-breakpoint
ALTER TABLE "sprints" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "capacity_points" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "number" integer;--> statement-breakpoint
-- Existing sprints are numbered per project by start date.
UPDATE "sprints" SET "number" = n."number" FROM (
	SELECT "id", row_number() OVER (PARTITION BY "project_id" ORDER BY "start_date", "id") AS "number" FROM "sprints"
) n WHERE n."id" = "sprints"."id";--> statement-breakpoint
ALTER TABLE "sprints" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "size" "task_size";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "sprint_memberships" ADD CONSTRAINT "sprint_memberships_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_memberships" ADD CONSTRAINT "sprint_memberships_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_memberships" ADD CONSTRAINT "sprint_memberships_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_memberships" ADD CONSTRAINT "sprint_memberships_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_periods" ADD CONSTRAINT "task_status_periods_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_periods" ADD CONSTRAINT "task_status_periods_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_periods" ADD CONSTRAINT "task_status_periods_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_periods" ADD CONSTRAINT "task_status_periods_exited_by_users_id_fk" FOREIGN KEY ("exited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_holidays" ADD CONSTRAINT "workspace_holidays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprint_memberships_sprint_id_added_at_idx" ON "sprint_memberships" USING btree ("sprint_id","added_at");--> statement-breakpoint
CREATE INDEX "sprint_memberships_task_id_idx" ON "sprint_memberships" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_memberships_open_unique" ON "sprint_memberships" USING btree ("task_id") WHERE "sprint_memberships"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "task_status_periods_task_id_entered_at_idx" ON "task_status_periods" USING btree ("task_id","entered_at");--> statement-breakpoint
CREATE INDEX "task_status_periods_status_id_entered_at_idx" ON "task_status_periods" USING btree ("status_id","entered_at");--> statement-breakpoint
CREATE INDEX "task_status_periods_category_exited_at_idx" ON "task_status_periods" USING btree ("category","exited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_status_periods_open_unique" ON "task_status_periods" USING btree ("task_id") WHERE "task_status_periods"."exited_at" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_workspace_id_type_created_at_idx" ON "activity" USING btree ("workspace_id","type","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_id_created_at_idx" ON "comments" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_number_unique" UNIQUE("project_id","number");