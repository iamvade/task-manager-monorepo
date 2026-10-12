import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '../i18n';
import { FakeWebSocket } from './fakeSocket';

// Files run in parallel, and routes load lazily (the page's chunk is imported on first visit):
// under load a first render can take a few seconds. Only failing waits take this long.
configure({ asyncUtilTimeout: 6000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  FakeWebSocket.reset();
});

// The realtime socket never reaches a server in tests.
globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

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

// cmdk (⌘K palette) observes its list's size; jsdom has no ResizeObserver.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
};
