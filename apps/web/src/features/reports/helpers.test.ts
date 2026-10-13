import { sidebarResponseSchema } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { PROJECT_ID, SIDEBAR as RAW_SIDEBAR, SPACE_ID } from '../../test/fixtures';
import { niceTicks, tooltipPlacement } from './charts/scale';
import { compareDelta, percentOf } from './delta';
import { mnFrom, weekLabel } from './format';
import { insightVariant, waitsInsight } from './insights';
import {
  filtersSearch,
  parseReportFilters,
  scopeForProject,
  scopeForSpace,
  writeReportFilters,
} from './params';

const SIDEBAR = sidebarResponseSchema.parse(RAW_SIDEBAR);

describe('compareDelta', () => {
  it('a rise in completions is good; a percentage needs a previous value', () => {
    expect(compareDelta(142, 127, { kind: 'percent' })).toEqual({
      amount: 12,
      direction: 'up',
      tone: 'good',
    });
    expect(compareDelta(5, 0, { kind: 'percent' })).toBeNull();
  });

  it('lower is better: a falling cycle time is an improvement, a rising one is not', () => {
    expect(compareDelta(3.2, 3.8, { kind: 'diff', decimals: 1, lowerIsBetter: true })).toEqual({
      amount: 0.6,
      direction: 'down',
      tone: 'good',
    });
    expect(compareDelta(3.5, 3.3, { kind: 'diff', decimals: 1, lowerIsBetter: true })?.tone).toBe(
      'bad',
    );
    expect(compareDelta(null, 3, { kind: 'diff' })).toBeNull();
  });

  it('no change is neutral; neutral mode never judges', () => {
    expect(compareDelta(4, 4, { kind: 'diff' })).toEqual({
      amount: 0,
      direction: 'flat',
      tone: 'neutral',
    });
    expect(compareDelta(2, 5, { kind: 'diff', neutral: true })?.tone).toBe('neutral');
  });

  it('percentOf rounds and needs a denominator', () => {
    expect(percentOf(124, 142)).toBe(87);
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('waitsInsight', () => {
  it('names the slowest status and its ratio to the next slowest', () => {
    const insight = waitsInsight([
      { category: 'todo', medianDays: 1.4 },
      { category: 'in_progress', medianDays: 2.1 },
      { category: 'review', medianDays: 4.6 },
    ]);
    expect(insight).toEqual({ category: 'review', days: 4.6, ratio: 2 });
    expect(insightVariant(2)).toBe('twice');
    expect(insightVariant(3.5)).toBe('times');
    expect(insightVariant(1)).toBe('slight');
    expect(insightVariant(Infinity)).toBe('much');
  });

  it('needs two medians to compare', () => {
    expect(
      waitsInsight([
        { category: 'todo', medianDays: null },
        { category: 'review', medianDays: 3 },
      ]),
    ).toBeNull();
  });
});

describe('chart helpers', () => {
  it('niceTicks covers the max with whole 1·2·5 steps', () => {
    expect(niceTicks(38)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(0)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150, 200]);
  });

  it('tooltips flip near the edges', () => {
    expect(tooltipPlacement(0, 12).transform).toBe('translateX(-12px)');
    expect(tooltipPlacement(6, 12).transform).toBe('translateX(-50%)');
    expect(tooltipPlacement(11, 12).transform).toBe('translateX(calc(-100% + 12px))');
  });
});

describe('format', () => {
  it('week labels: "Jul 20" / "7/20"', () => {
    expect(weekLabel('2026-07-20', 'en')).toBe('Jul 20');
    expect(weekLabel('2026-07-20', 'mn')).toBe('7/20');
  });

  it('Mongolian "from" suffix follows the spoken numeral', () => {
    expect(mnFrom(142)).toBe('142-оос');
    expect(mnFrom(5)).toBe('5-аас');
    expect(mnFrom(1)).toBe('1-ээс');
    expect(mnFrom(20)).toBe('20-иос');
    expect(mnFrom(100)).toBe('100-гаас');
    expect(mnFrom(7)).toBe('7-гоос');
  });
});

describe('report params', () => {
  it('parses the URL with defaults and drops invalid custom ranges', () => {
    expect(parseReportFilters(new URLSearchParams(''))).toEqual({ period: '4w' });
    expect(
      parseReportFilters(new URLSearchParams('period=custom&from=2026-09-01&to=2026-09-30')),
    ).toEqual({ period: 'custom', from: '2026-09-01', to: '2026-09-30' });
    expect(
      parseReportFilters(new URLSearchParams('period=custom&from=2026-09-30&to=2026-09-01')),
    ).toEqual({ period: '4w' });
    expect(parseReportFilters(new URLSearchParams('period=year'))).toEqual({ period: '4w' });
    expect(parseReportFilters(new URLSearchParams('period=lastMonth'))).toEqual({
      period: 'lastMonth',
    });
  });

  it('writes filters, keeping other params, omitting defaults', () => {
    const next = writeReportFilters(new URLSearchParams('task=APP-1&period=week'), {
      period: '4w',
      projectId: PROJECT_ID,
    });
    expect(next.toString()).toBe(`task=APP-1&project=${PROJECT_ID}`);
    expect(filtersSearch(new URLSearchParams('task=APP-1&aging=all&period=week'))).toBe(
      '?period=week',
    );
  });

  it('a project selects its space; another space drops the project', () => {
    expect(scopeForProject(SIDEBAR.spaces, PROJECT_ID)).toEqual({
      spaceId: SPACE_ID,
      projectId: PROJECT_ID,
    });
    const current = { period: '4w' as const, spaceId: SPACE_ID, projectId: PROJECT_ID };
    expect(scopeForSpace(SIDEBAR.spaces, current, SPACE_ID).projectId).toBe(PROJECT_ID);
    const other = SIDEBAR.spaces[1]?.id;
    expect(scopeForSpace(SIDEBAR.spaces, current, other)).toEqual({
      spaceId: other,
      projectId: undefined,
    });
  });
});
