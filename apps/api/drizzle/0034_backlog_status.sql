ALTER TYPE "public"."status_category" ADD VALUE 'backlog' BEFORE 'todo';-- Projects get the new default Backlog status from ensureDefaultStatuses after the migrations
-- run (an enum value can't be used in the transaction that adds it).
