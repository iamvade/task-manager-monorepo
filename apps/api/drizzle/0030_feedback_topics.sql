ALTER TYPE "public"."feedback_activity_kind" ADD VALUE 'topic_change';--> statement-breakpoint
CREATE TABLE "feedback_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_topics_workspace_id_key_unique" UNIQUE("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback_topics" ADD CONSTRAINT "feedback_topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_topics" ADD CONSTRAINT "feedback_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_topics_workspace_id_lower_name_unique" ON "feedback_topics" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_topic_id_feedback_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."feedback_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_topic_id_idx" ON "feedback" USING btree ("workspace_id","topic_id");