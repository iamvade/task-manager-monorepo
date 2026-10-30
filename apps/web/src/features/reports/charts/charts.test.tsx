import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { at } from '../../../test/tasks';
import { Burndown } from './Burndown';
import { LineTrend } from './LineTrend';
import { ReferenceTrend } from './ReferenceTrend';
import { StackedBar } from './StackedBar';

/** The open chart tooltip (hidden from the accessibility tree; the data table reads out). */
const tooltip = (container: HTMLElement) => {
  const tip = container.querySelector<HTMLElement>('[data-chart-tooltip]');
  if (!tip) throw new Error('No chart tooltip');
  return tip;
};

describe('LineTrend', () => {
  const points = [10, 20, 15].map((value, i) => ({
    label: `W${String(i)}`,
    title: `Week ${String(i)}`,
    value,
    prev: value - 2,
    partial: i === 2,
  }));

  it('draws a hollow partial point and shows its note in the tooltip', () => {
    const { container } = render(
      <LineTrend
        points={points}
        seriesLabel="This period"
        prevLabel="Previous period"
        partialNote="This week is still in progress"
        ariaLabel="Summary"
      />,
    );
    expect(screen.getByRole('figure', { name: 'Summary' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-partial]')).toHaveLength(1);
    expect(container.querySelectorAll('path')).toHaveLength(2);

    const columns = [...container.querySelectorAll('.h-full.flex-1')];
    fireEvent.mouseEnter(at(columns, 2));
    const tip = tooltip(container);
    expect(tip).toHaveTextContent('Week 2');
    expect(tip).toHaveTextContent('This week is still in progress');
    fireEvent.mouseEnter(at(columns, 0));
    expect(tooltip(container)).not.toHaveTextContent('still in progress');
  });

  it('steps through the points from the keyboard', () => {
    const { container } = render(
      <LineTrend points={points} seriesLabel="This period" ariaLabel="Summary" />,
    );
    const layer = screen.getByRole('group', { name: /Summary/ });
    fireEvent.focus(layer);
    expect(tooltip(container)).toHaveTextContent('Week 2');
    fireEvent.keyDown(layer, { key: 'ArrowLeft' });
    expect(tooltip(container)).toHaveTextContent('Week 1');
    fireEvent.keyDown(layer, { key: 'Home' });
    expect(tooltip(container)).toHaveTextContent('Week 0');
    fireEvent.keyDown(layer, { key: 'ArrowLeft' });
    expect(tooltip(container)).toHaveTextContent('Week 0');
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(container.querySelector('[data-chart-tooltip]')).toBeNull();
  });

  it('tints the band columns and dashes the previous line', () => {
    const { container } = render(
      <LineTrend
        points={points}
        seriesLabel="Last 12 weeks"
        prevLabel="12 weeks before"
        ariaLabel="Summary"
        band={{ from: 1, to: 2 }}
        prevDashed
      />,
    );
    const band = container.querySelector<HTMLElement>('[data-band]');
    expect(band?.style.left).toBe('33.33%');
    expect(band?.style.width).toBe('66.67%');
    expect(container.querySelector('path')).toHaveAttribute('stroke-dasharray', '4 4');
  });
});

describe('StackedBar', () => {
  it('sizes the bar on the shared scale, skips empty segments and marks capacity', () => {
    const { container } = render(
      <StackedBar
        scale={30}
        marker={15}
        segments={[
          { key: 'overdue', value: 6, fill: 'var(--bucket-overdue)', title: 'Overdue: 6' },
          { key: 'week', value: 0, fill: 'var(--bucket-week)', title: 'Week: 0' },
          { key: 'none', value: 9, fill: 'hatch', title: 'No due date: 9' },
        ]}
      />,
    );
    const marker = at([...container.querySelectorAll<HTMLElement>('[data-marker]')], 0);
    expect(marker.style.left).toBe('50%');
    expect(screen.getByTitle('Overdue: 6')).toBeInTheDocument();
    expect(screen.queryByTitle('Week: 0')).toBeNull();
    expect(screen.getByTitle('Overdue: 6').parentElement).toHaveStyle({ width: '50%' });
  });
});

describe('Burndown', () => {
  it('shows remaining up to today and the projection after it', () => {
    const points = [10, 8, 7, null, null].map((remaining, i) => ({
      label: i === 0 ? 'Oct 6' : '',
      title: `Day ${String(i)}`,
      remaining,
      ideal: 10 - i * 2.5,
      projected: i >= 2 ? Math.max(0, 7 - (i - 2) * 1.5) : null,
      added: i === 1 ? 2 : 0,
    }));
    const { container } = render(
      <Burndown
        points={points}
        todayIndex={2}
        ariaLabel="Burndown"
        labels={{
          remaining: 'Remaining',
          ideal: 'Ideal',
          projection: 'Projection',
          today: 'Today',
        }}
        formatCount={(n) => `${String(n)} tasks`}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    const columns = [...container.querySelectorAll('.h-full.flex-1')];
    fireEvent.mouseEnter(at(columns, 1));
    expect(tooltip(container)).toHaveTextContent('Remaining8 tasks');
    fireEvent.mouseEnter(at(columns, 4));
    expect(tooltip(container)).toHaveTextContent('Projection4 tasks');
  });
});

describe('ReferenceTrend', () => {
  const values = [2, 3, null, 4, 3];
  const points = values.map((value, i) => ({
    label: `W${String(i)}`,
    title: `Week ${String(i)}`,
    value,
    partial: i === values.length - 1,
  }));

  function setup() {
    return render(
      <ReferenceTrend
        points={points}
        reference={3}
        max={6}
        formatValue={String}
        formatTooltip={(v) => `${String(v)} tasks`}
        partialNote="This week is still in progress"
        ariaLabel="Completed per week"
        table={{
          caption: 'Completed per week',
          columns: ['Week', 'Completed'],
          rows: points.map((p) => [p.title, p.value ?? '—']),
        }}
      />,
    );
  }

  it('breaks the line at a week without a value and draws the reference', () => {
    const { container } = setup();
    expect(screen.getByRole('figure', { name: 'Completed per week' })).toBeInTheDocument();
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(d.match(/M/g)).toHaveLength(2);
    expect(container.querySelector('[data-reference]')).toHaveStyle({ top: '48px' });
    // First and last week only.
    expect(screen.getByText('W0')).toBeInTheDocument();
    expect(screen.getByText('W4')).toBeInTheDocument();
    expect(screen.queryByText('W2')).toBeNull();
  });

  it('reads out as a table and shows a compact tooltip', () => {
    const { container } = setup();
    const table = screen.getByRole('table', { name: 'Completed per week' });
    expect(table).toHaveTextContent('Week 2—');
    const columns = [...container.querySelectorAll('.h-full.flex-1')];
    fireEvent.mouseEnter(at(columns, 4));
    const tip = tooltip(container);
    expect(tip).toHaveTextContent('Week 43 tasksThis week is still in progress');
  });
});
