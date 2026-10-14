CREATE TABLE "task_references" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_references_source_target_comment_unique" UNIQUE NULLS NOT DISTINCT("source_task_id","target_task_id","comment_id")
);
--> statement-breakpoint
ALTER TABLE "task_references" ADD CONSTRAINT "task_references_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_references" ADD CONSTRAINT "task_references_target_task_id_tasks_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_references" ADD CONSTRAINT "task_references_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_references_target_task_id_idx" ON "task_references" USING btree ("target_task_id");--> statement-breakpoint
-- Backfill: keys already written in titles, descriptions and live comments (same workspace only).
INSERT INTO "task_references" ("id", "source_task_id", "target_task_id", "comment_id", "created_at")
SELECT kite_uuidv7(), src.id, tgt.id, NULL, now()
FROM "tasks" src
JOIN "projects" sp ON sp.id = src.project_id
CROSS JOIN LATERAL regexp_matches(
	src.title || ' ' || src.description_text,
	'(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,9})-([0-9]{1,9})(?![A-Za-z0-9])', 'g') AS m(parts)
JOIN "projects" tp ON tp.workspace_id = sp.workspace_id AND tp.key = m.parts[1]
JOIN "tasks" tgt ON tgt.project_id = tp.id AND tgt.number = m.parts[2]::int
WHERE tgt.id <> src.id
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "task_references" ("id", "source_task_id", "target_task_id", "comment_id", "created_at")
SELECT kite_uuidv7(), src.id, tgt.id, c.id, c.created_at
FROM "comments" c
JOIN "tasks" src ON src.id = c.task_id
JOIN "projects" sp ON sp.id = src.project_id
CROSS JOIN LATERAL regexp_matches(
	c.body_text,
	'(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,9})-([0-9]{1,9})(?![A-Za-z0-9])', 'g') AS m(parts)
JOIN "projects" tp ON tp.workspace_id = sp.workspace_id AND tp.key = m.parts[1]
JOIN "tasks" tgt ON tgt.project_id = tp.id AND tgt.number = m.parts[2]::int
WHERE tgt.id <> src.id AND c.deleted_at IS NULL
ON CONFLICT DO NOTHING;
