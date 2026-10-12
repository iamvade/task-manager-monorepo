import { describe, expect, it } from 'vitest';
import { workloadReport } from '../../../test/reports';
import { sharedCapacity, sortPeople, workloadScale, workloadTicks } from './layout';

describe('workload layout', () => {
  it('shares one scale: at least 25, else the largest size or Heavy line rounded up to 5', () => {
    expect(workloadScale([{ points: 21, capacity: 15 }])).toBe(25);
    expect(workloadScale([{ points: 27, capacity: 15 }])).toBe(30);
    expect(workloadScale([{ points: 3, capacity: 30 }])).toBe(40);
    expect(workloadTicks(25)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(workloadTicks(60)).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it('sorts by open size or by overdue points, ties by name', () => {
    const { people } = workloadReport();
    expect(sortPeople(people, 'size').map((p) => p.user.name)).toEqual([
      'Dorj E.',
      'Sara Khan',
      'Bat O.',
    ]);
    const tied = people.map((p) => ({ ...p, points: 5, buckets: { ...p.buckets } }));
    expect(sortPeople(tied, 'size').map((p) => p.user.name)).toEqual([
      'Dorj E.',
      'Bat O.',
      'Sara Khan',
    ]);
    expect(sortPeople(people, 'overdue')[0]?.user.name).toBe('Dorj E.');
  });

  it('names the capacity only when everyone shares it', () => {
    expect(sharedCapacity([{ capacity: 15 }, { capacity: 15 }])).toBe(15);
    expect(sharedCapacity([{ capacity: 15 }, { capacity: 10 }])).toBeNull();
  });
});
