CREATE TYPE "public"."feedback_activity_kind" AS ENUM('created', 'note', 'status_change', 'linked', 'unlinked', 'assignee_change', 'similar_found');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'review', 'linked', 'closed');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('bug', 'feature', 'feedback', 'other');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"type" "feedback_type" NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"submitter_name" text,
	"email" text NOT NULL,
	"phone" text,
	"user_agent" text DEFAULT '' NOT NULL,
	"device" jsonb NOT NULL,
	"task_id" uuid,
	"notify_on_done" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_workspace_id_number_unique" UNIQUE("workspace_id","number"),
	CONSTRAINT "feedback_title_length_check" CHECK (char_length("feedback"."title") <= 120)
);
--> statement-breakpoint
CREATE TABLE "feedback_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" "feedback_activity_kind" NOT NULL,
	"text" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feedback_id" uuid,
	"upload_token_hash" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "feedback_seq" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_activity" ADD CONSTRAINT "feedback_activity_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_activity" ADD CONSTRAINT "feedback_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_status_idx" ON "feedback" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_type_idx" ON "feedback" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_created_at_idx" ON "feedback" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_task_id_idx" ON "feedback" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "feedback_title_trgm_idx" ON "feedback" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "feedback_activity_feedback_id_created_at_idx" ON "feedback_activity" USING btree ("feedback_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_attachments_feedback_id_idx" ON "feedback_attachments" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_attachments_unclaimed_idx" ON "feedback_attachments" USING btree ("created_at") WHERE "feedback_attachments"."feedback_id" is null;--> statement-breakpoint
CREATE INDEX "feedback_attachments_workspace_id_idx" ON "feedback_attachments" USING btree ("workspace_id");