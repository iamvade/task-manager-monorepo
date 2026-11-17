CREATE TYPE "public"."personal_item_kind" AS ENUM('note', 'todo');--> statement-breakpoint
CREATE TABLE "personal_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "personal_item_kind" DEFAULT 'note' NOT NULL,
	"topic_id" uuid,
	"title" text NOT NULL,
	"body" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personal_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"target_item_id" uuid,
	"target_task_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_links_one_target" CHECK ("personal_links"."target_item_id" is null or "personal_links"."target_task_id" is null)
);
--> statement-breakpoint
CREATE TABLE "personal_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_items" ADD CONSTRAINT "personal_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_items" ADD CONSTRAINT "personal_items_topic_id_personal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."personal_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_source_item_id_personal_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."personal_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_target_item_id_personal_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."personal_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_target_task_id_tasks_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_topics" ADD CONSTRAINT "personal_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_items_user_id_position_idx" ON "personal_items" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "personal_items_deleted_at_idx" ON "personal_items" USING btree ("deleted_at") WHERE "personal_items"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "personal_links_user_id_idx" ON "personal_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_links_source_item_id_idx" ON "personal_links" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "personal_links_target_item_id_idx" ON "personal_links" USING btree ("target_item_id");--> statement-breakpoint
CREATE INDEX "personal_links_target_task_id_idx" ON "personal_links" USING btree ("target_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_topics_user_id_lower_name_unique" ON "personal_topics" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "personal_topics_user_id_position_idx" ON "personal_topics" USING btree ("user_id","position");