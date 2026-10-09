DROP INDEX "subtasks_task_id_position_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "subtasks_task_id_position_unique" ON "subtasks" USING btree ("task_id","position");