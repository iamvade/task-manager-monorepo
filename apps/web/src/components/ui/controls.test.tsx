import { matchesName } from '@kite/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { SegmentedControl } from './SegmentedControl';
import { StatusDot } from './StatusDot';
import { UnderlineTabs } from './UnderlineTabs';

const PEOPLE = [
  { id: 'a', name: 'Anu B.' },
  { id: 's', name: 'Sara K.' },
  { id: 'd', name: 'Dorj E.' },
];

describe('Picker', () => {
  function setup(onSelect = vi.fn(), onClear = vi.fn()) {
    render(
      <Picker
        label="Assignee"
        items={PEOPLE}
        value="s"
        getKey={(p) => p.id}
        getLabel={(p) => p.name}
        onSelect={onSelect}
        onClear={onClear}
        search={{ placeholder: 'Assign to…' }}
        footerHints
      />,
    );
    return { onSelect, onClear, input: screen.getByRole('combobox') };
  }

  it('marks the selected option and filters by the query', () => {
    const { input } = setup();
    expect(screen.getByRole('option', { name: /Sara K\./ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.change(input, { target: { value: 'dor' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Dorj E.');
  });

  it('opens with the current value highlighted', () => {
    const { input } = setup();
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[2]?.id);
  });

  it('moves with arrows and selects with Enter', () => {
    const { input, onSelect } = setup();
    // Starts on the selected option (Sara, index 1).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2]?.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(PEOPLE[2]);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(PEOPLE[2]);
  });

  it('clears with Backspace on an empty query', () => {
    const { input, onClear } = setup();
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onClear).toHaveBeenCalled();
  });

  it('takes a custom search filter (cross-script names)', () => {
    render(
      <Picker
        label="Assignee"
        items={[{ id: 'g', name: 'Бат-Эрдэнэ Ганболд' }, ...PEOPLE]}
        value={null}
        getKey={(p) => p.id}
        getLabel={(p) => p.name}
        onSelect={vi.fn()}
        search={{ placeholder: 'Assign to…', filter: (p, q) => matchesName(p.name, q) }}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bat' } });
    expect(screen.getByRole('option')).toHaveTextContent('Бат-Эрдэнэ Ганболд');
  });

  it('shows the empty text', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Илэрц олдсонгүй')).toBeInTheDocument();
  });
});

describe('SegmentedControl', () => {
  function Harness() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return (
      <SegmentedControl
        label="Mode"
        value={value}
        onChange={setValue}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ]}
      />
    );
  }

  it('selects with arrow keys and wraps around', () => {
    render(<Harness />);
    const a = screen.getByRole('radio', { name: 'A' });
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'C' }), { key: 'ArrowRight' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('StatusDot', () => {
  it('draws the in-progress half fill', () => {
    render(<StatusDot category="in_progress" label="In Progress" />);
    const dot = screen.getByRole('img', { name: 'In Progress' });
    expect(dot.style.background).toContain('linear-gradient');
    expect(dot.style.borderWidth).toBe('2px');
  });
});

describe('UnderlineTabs', () => {
  const ITEMS = ['list', 'board', 'calendar'].map((v) => ({ value: v, label: v, to: `/${v}` }));

  function Tabs() {
    const value = useLocation().pathname.slice(1);
    return <UnderlineTabs items={ITEMS} value={value} label="Views" />;
  }

  it('keeps only the selected tab tabbable and moves with arrows, Home and End', () => {
    render(
      <MemoryRouter initialEntries={['/board']}>
        <Routes>
          <Route path="*" element={<Tabs />} />
        </Routes>
      </MemoryRouter>,
    );
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(tab('board')).toHaveAttribute('tabindex', '0');
    expect(tab('list')).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(tab('board'), { key: 'ArrowRight' });
    expect(tab('calendar')).toHaveAttribute('aria-selected', 'true');
    expect(tab('calendar')).toHaveFocus();
    fireEvent.keyDown(tab('calendar'), { key: 'ArrowRight' });
    expect(tab('list')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('list'), { key: 'End' });
    expect(tab('calendar')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('calendar'), { key: 'Home' });
    expect(tab('list')).toHaveFocus();
    expect(tab('list')).toHaveAttribute('tabindex', '0');
  });
});
