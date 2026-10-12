import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { at } from '../../../test/tasks';
import { Burndown } from './Burndown';
import { LineTrend } from './LineTrend';
import { StackedBar } from './StackedBar';

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
    const tip = screen.getByRole('status');
    expect(tip).toHaveTextContent('Week 2');
    expect(tip).toHaveTextContent('This week is still in progress');
    fireEvent.mouseEnter(at(columns, 0));
    expect(screen.getByRole('status')).not.toHaveTextContent('still in progress');
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
    expect(screen.getByRole('status')).toHaveTextContent('Remaining8 tasks');
    fireEvent.mouseEnter(at(columns, 4));
    expect(screen.getByRole('status')).toHaveTextContent('Projection4 tasks');
  });
});
