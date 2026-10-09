import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '../i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no layout: keyboard navigation scrolls the selected row into view.
Element.prototype.scrollIntoView = function scrollIntoView() {
  // no-op
};
