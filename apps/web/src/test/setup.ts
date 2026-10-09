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

// ProseMirror (TipTap) measures the DOM for selections and coordinates; jsdom has no layout.
const emptyRect = () => new DOMRect(0, 0, 0, 0);
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = emptyRect;
Range.prototype.getClientRects = emptyRects;
Element.prototype.getClientRects = emptyRects;
document.elementFromPoint = () => null;
