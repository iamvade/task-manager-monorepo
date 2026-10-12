-- Report data backfill (idempotent) and the invariants behind it.
-- Status periods and sprint memberships are rebuilt from the activity log for tasks that have none;
-- the functions stay installed so tests (and a repair) can call them again.

-- UUIDv7 for rows written in SQL, timestamped like the row so ids stay time-sortable.
CREATE OR REPLACE FUNCTION kite_uuidv7(ts timestamptz DEFAULT clock_timestamp()) RETURNS uuid
LANGUAGE sql VOLATILE AS $$
	SELECT encode(
		set_bit(set_bit(
			overlay(uuid_send(gen_random_uuid())
				placing substring(int8send(floor(extract(epoch FROM ts) * 1000)::bigint) FROM 3)
				FROM 1 FOR 6),
			52, 1), 53, 1),
		'hex')::uuid
$$;--> statement-breakpoint

-- Rebuilds the status periods of every task that has none, from its `task.created` and
-- `status.changed` rows (the first status: `task.created.status`, else the `from` of the first
-- change, else the current status). Then any open period that doesn't match the task's status
-- (moves between projects logged only `project.changed`) is closed at that move and followed by
-- one for the current status. Returns the number of periods written.
CREATE OR REPLACE FUNCTION kite_backfill_status_periods() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
	written integer;
	fixed integer;
BEGIN
	WITH todo AS (
		SELECT t.id, t.status_id, t.created_at, t.created_by
		FROM tasks t
		WHERE NOT EXISTS (SELECT 1 FROM task_status_periods p WHERE p.task_id = t.id)
	),
	created AS (
		SELECT DISTINCT ON (a.task_id) a.task_id, a.created_at, a.actor_id, a.payload -> 'status' AS status
		FROM activity a JOIN todo ON todo.id = a.task_id
		WHERE a.type = 'task.created'
		ORDER BY a.task_id, a.created_at, a.id
	),
	first_change AS (
		SELECT DISTINCT ON (a.task_id) a.task_id, a.payload -> 'from' AS status
		FROM activity a JOIN todo ON todo.id = a.task_id
		WHERE a.type = 'status.changed'
		ORDER BY a.task_id, a.created_at, a.id
	),
	transitions AS (
		SELECT todo.id AS task_id,
			COALESCE(created.created_at, todo.created_at) AS at,
			COALESCE(created.actor_id, todo.created_by) AS actor_id,
			COALESCE((created.status ->> 'id')::uuid, (first_change.status ->> 'id')::uuid, todo.status_id) AS status_id,
			COALESCE((created.status ->> 'category')::status_category, (first_change.status ->> 'category')::status_category, s.category) AS category,
			0 AS ord, NULL::uuid AS activity_id
		FROM todo
		LEFT JOIN created ON created.task_id = todo.id
		LEFT JOIN first_change ON first_change.task_id = todo.id
		JOIN statuses s ON s.id = todo.status_id
		UNION ALL
		SELECT a.task_id, a.created_at, a.actor_id,
			(a.payload -> 'to' ->> 'id')::uuid,
			(a.payload -> 'to' ->> 'category')::status_category,
			1, a.id
		FROM activity a JOIN todo ON todo.id = a.task_id
		WHERE a.type = 'status.changed'
	),
	chained AS (
		SELECT tr.*,
			lead(tr.at) OVER w AS exited_at,
			lead(tr.actor_id) OVER w AS exited_by
		FROM transitions tr
		WINDOW w AS (PARTITION BY tr.task_id ORDER BY tr.at, tr.ord, tr.activity_id)
	)
	INSERT INTO task_status_periods (id, task_id, status_id, category, entered_at, exited_at, entered_by, exited_by)
	SELECT kite_uuidv7(c.at), c.task_id, s.id, c.category, c.at, c.exited_at, c.actor_id, c.exited_by
	FROM chained c
	LEFT JOIN statuses s ON s.id = c.status_id;
	GET DIAGNOSTICS written = ROW_COUNT;

	WITH stale AS (
		SELECT p.id AS period_id, t.id AS task_id, t.status_id, s.category,
			GREATEST(p.entered_at, COALESCE(mv.created_at, t.updated_at)) AS at,
			COALESCE(mv.actor_id, t.created_by) AS actor_id
		FROM task_status_periods p
		JOIN tasks t ON t.id = p.task_id
		JOIN statuses s ON s.id = t.status_id
		LEFT JOIN LATERAL (
			SELECT a.created_at, a.actor_id FROM activity a
			WHERE a.task_id = t.id AND a.type = 'project.changed'
			ORDER BY a.created_at DESC, a.id DESC LIMIT 1
		) mv ON true
		WHERE p.exited_at IS NULL AND p.status_id IS DISTINCT FROM t.status_id
	),
	closed AS (
		UPDATE task_status_periods p SET exited_at = stale.at, exited_by = stale.actor_id
		FROM stale WHERE p.id = stale.period_id
		RETURNING p.task_id
	)
	INSERT INTO task_status_periods (id, task_id, status_id, category, entered_at, entered_by)
	SELECT kite_uuidv7(stale.at), stale.task_id, stale.status_id, stale.category, stale.at, stale.actor_id
	FROM stale JOIN closed ON closed.task_id = stale.task_id;
	GET DIAGNOSTICS fixed = ROW_COUNT;

	RETURN written + fixed;
END
$$;--> statement-breakpoint

-- Opens a membership for every task in a sprint without an open one: added at its latest
-- `sprint.changed` into that sprint, else when the task was created. Returns the rows written.
CREATE OR REPLACE FUNCTION kite_backfill_sprint_memberships() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
	written integer;
BEGIN
	INSERT INTO sprint_memberships (id, task_id, sprint_id, added_at, added_by)
	SELECT kite_uuidv7(COALESCE(ch.created_at, t.created_at)), t.id, t.sprint_id,
		COALESCE(ch.created_at, t.created_at), COALESCE(ch.actor_id, t.created_by)
	FROM tasks t
	LEFT JOIN LATERAL (
		SELECT a.created_at, a.actor_id FROM activity a
		WHERE a.task_id = t.id AND a.type = 'sprint.changed'
			AND a.payload -> 'to' ->> 'id' = t.sprint_id::text
		ORDER BY a.created_at DESC, a.id DESC LIMIT 1
	) ch ON true
	WHERE t.sprint_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1 FROM sprint_memberships m WHERE m.task_id = t.id AND m.removed_at IS NULL
		);
	GET DIAGNOSTICS written = ROW_COUNT;
	RETURN written;
END
$$;--> statement-breakpoint

SELECT kite_backfill_status_periods();--> statement-breakpoint
SELECT kite_backfill_sprint_memberships();--> statement-breakpoint

-- Keep in sync with apps/api/src/db/holidays.ts.
INSERT INTO workspace_holidays (workspace_id, date, name)
SELECT w.id, h.date, h.name
FROM workspaces w
CROSS JOIN (VALUES
	('2026-01-01'::date, 'New Year'),
	('2026-02-18'::date, 'Tsagaan Sar'),
	('2026-02-19'::date, 'Tsagaan Sar'),
	('2026-02-20'::date, 'Tsagaan Sar'),
	('2026-03-08'::date, 'International Women’s Day'),
	('2026-05-31'::date, 'Buddha’s Birthday'),
	('2026-06-01'::date, 'Mother and Child Day'),
	('2026-07-10'::date, 'Naadam'),
	('2026-07-11'::date, 'Naadam'),
	('2026-07-12'::date, 'Naadam'),
	('2026-07-13'::date, 'Naadam'),
	('2026-07-14'::date, 'Naadam'),
	('2026-07-15'::date, 'Naadam'),
	('2026-11-10'::date, 'Chinggis Khaan’s Birthday'),
	('2026-11-26'::date, 'Republic Day'),
	('2026-12-29'::date, 'National Freedom and Independence Day')
) AS h(date, name)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Guards, checked at commit: a task's status must have a matching open status period, and its
-- sprint a matching open membership (and no open membership without a sprint). Every write goes
-- through apps/api/src/tasks/status.ts and tasks/sprint.ts; anything else fails here.
CREATE OR REPLACE FUNCTION kite_check_task_status_period() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	-- Rows changed again (or deleted) later in the transaction are checked by their last event.
	IF EXISTS (SELECT 1 FROM tasks t WHERE t.id = NEW.id AND t.status_id = NEW.status_id)
		AND NOT EXISTS (
			SELECT 1 FROM task_status_periods p
			WHERE p.task_id = NEW.id AND p.exited_at IS NULL AND p.status_id = NEW.status_id
		)
	THEN
		RAISE EXCEPTION 'Task % has status % without an open status period', NEW.id, NEW.status_id
			USING ERRCODE = 'check_violation', HINT = 'Change status through tasks/status.ts';
	END IF;
	RETURN NULL;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION kite_check_task_sprint_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (SELECT 1 FROM tasks t WHERE t.id = NEW.id AND t.sprint_id IS NOT DISTINCT FROM NEW.sprint_id)
		AND (
			(NEW.sprint_id IS NOT NULL AND NOT EXISTS (
				SELECT 1 FROM sprint_memberships m
				WHERE m.task_id = NEW.id AND m.removed_at IS NULL AND m.sprint_id = NEW.sprint_id
			))
			OR (NEW.sprint_id IS NULL AND EXISTS (
				SELECT 1 FROM sprint_memberships m WHERE m.task_id = NEW.id AND m.removed_at IS NULL
			))
		)
	THEN
		RAISE EXCEPTION 'Task % has sprint % without a matching open sprint membership', NEW.id, NEW.sprint_id
			USING ERRCODE = 'check_violation', HINT = 'Change sprints through tasks/sprint.ts';
	END IF;
	RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER tasks_status_period_check
	AFTER INSERT OR UPDATE OF status_id ON tasks
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION kite_check_task_status_period();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER tasks_sprint_membership_check
	AFTER INSERT OR UPDATE OF sprint_id ON tasks
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION kite_check_task_sprint_membership();
