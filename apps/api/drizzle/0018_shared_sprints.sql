CREATE TABLE "sprint_projects" (
	"sprint_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "sprint_projects_sprint_id_project_id_pk" PRIMARY KEY("sprint_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "sprints" DROP CONSTRAINT "sprints_project_id_number_unique";--> statement-breakpoint
ALTER TABLE "sprints" DROP CONSTRAINT "sprints_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "created_by" uuid;--> statement-breakpoint
-- Each existing sprint becomes a workspace sprint covering its old project only.
UPDATE "sprints" SET "workspace_id" = p."workspace_id" FROM "projects" p WHERE p."id" = "sprints"."project_id";--> statement-breakpoint
INSERT INTO "sprint_projects" ("sprint_id", "project_id") SELECT "id", "project_id" FROM "sprints";--> statement-breakpoint
-- Numbers become a workspace sequence: workspaces where two projects used the same number are
-- renumbered by start date; the others keep theirs. History snapshots keep the old numbers.
UPDATE "sprints" SET "number" = n."number" FROM (
	SELECT "id", row_number() OVER (PARTITION BY "workspace_id" ORDER BY "start_date", "id") AS "number"
	FROM "sprints"
	WHERE "workspace_id" IN (
		SELECT "workspace_id" FROM "sprints" GROUP BY "workspace_id", "number" HAVING count(*) > 1
	)
) n WHERE n."id" = "sprints"."id";--> statement-breakpoint
ALTER TABLE "sprints" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sprint_projects" ADD CONSTRAINT "sprint_projects_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_projects" ADD CONSTRAINT "sprint_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprint_projects_project_id_idx" ON "sprint_projects" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_workspace_id_number_unique" UNIQUE("workspace_id","number");--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_dates_check" CHECK ("sprints"."end_date" >= "sprints"."start_date");
