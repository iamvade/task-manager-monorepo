import { activityPayloadSchemas, type TaskActivityType } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import type { Text } from '../src/db/seed/data.js';
import { createClock } from '../src/db/seed/dates.js';
import { buildRows } from '../src/db/seed/index.js';

describe('seed activity', () => {
  it('writes every payload in the shape the API reads back', () => {
    const pick = (text: Text) => (typeof text === 'string' ? text : text[1]);
    const rows = buildRows(createClock('2026-10-08'), pick, 'hash', 'en');
    expect(rows.activity.length).toBeGreaterThan(0);
    for (const row of rows.activity) {
      expect(Object.hasOwn(activityPayloadSchemas, row.type), row.type).toBe(true);
      const schema = activityPayloadSchemas[row.type as TaskActivityType];
      const parsed = schema.safeParse(row.payload);
      expect(parsed.success, `${row.type} ${JSON.stringify(row.payload)}`).toBe(true);
    }
  });
});
