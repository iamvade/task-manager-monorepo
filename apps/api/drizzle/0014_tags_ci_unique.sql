-- Tag names become unique per workspace regardless of case. First merge existing case-duplicates
-- into the oldest tag of each group (smallest UUIDv7): its tasks keep the tag, the rest are deleted.
CREATE TEMP TABLE "kite_tag_merge" AS
SELECT t.id AS "from_id", keep.id AS "into_id"
FROM "tags" t
JOIN LATERAL (
	SELECT k.id FROM "tags" k
	WHERE k.workspace_id = t.workspace_id AND lower(k.name) = lower(t.name)
	ORDER BY k.id
	LIMIT 1
) keep ON keep.id <> t.id;--> statement-breakpoint
INSERT INTO "task_tags" ("task_id", "tag_id")
SELECT tt.task_id, m.into_id FROM "task_tags" tt JOIN "kite_tag_merge" m ON m.from_id = tt.tag_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "tags" WHERE id IN (SELECT "from_id" FROM "kite_tag_merge");--> statement-breakpoint
DROP TABLE "kite_tag_merge";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_workspace_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_id_lower_name_unique" ON "tags" USING btree ("workspace_id",lower("name"));
