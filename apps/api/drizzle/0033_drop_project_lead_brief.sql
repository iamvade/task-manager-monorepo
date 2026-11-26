ALTER TABLE "projects" DROP CONSTRAINT "projects_lead_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "lead_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "description_text";