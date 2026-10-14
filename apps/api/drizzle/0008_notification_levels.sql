CREATE TYPE "public"."notification_level" AS ENUM('all', 'direct', 'none');--> statement-breakpoint
CREATE TABLE "project_notification_levels" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"level" "notification_level" NOT NULL,
	CONSTRAINT "project_notification_levels_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "project_notification_levels" ADD CONSTRAINT "project_notification_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notification_levels" ADD CONSTRAINT "project_notification_levels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;