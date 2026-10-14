import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RichTextView } from './RichTextView';

const doc = (...content: object[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

describe('RichTextView task keys', () => {
  it('links known task keys, leaving unknown ones, code and links alone', () => {
    render(
      <MemoryRouter>
        <RichTextView
          doc={doc(
            { type: 'text', text: 'Blocked by APP-12 and ISO-9001; ' },
            { type: 'text', text: 'APP-13', marks: [{ type: 'code' }] },
          )}
          taskHref={(key) => (key.startsWith('APP-') ? `/x?task=${key}` : null)}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'APP-12' })).toHaveAttribute('href', '/x?task=APP-12');
    expect(screen.queryByRole('link', { name: 'ISO-9001' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'APP-13' })).toBeNull();
  });
});
