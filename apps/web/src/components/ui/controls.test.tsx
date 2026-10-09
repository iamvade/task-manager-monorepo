import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { SegmentedControl } from './SegmentedControl';
import { StatusDot } from './StatusDot';

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

  it('moves with arrows and selects with Enter', () => {
    const { input, onSelect } = setup();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
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
