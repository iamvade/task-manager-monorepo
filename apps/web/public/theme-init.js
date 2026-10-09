/* global window, document, localStorage */
// Applies the last theme + accent before first paint (no light flash in dark mode).
// Mirrors applyAppearance() in src/preferences.ts, which writes `kite.appearance`.
(function () {
  var inkDark = {
    '#6E56CF': '#B4A5FF',
    '#2F6FEB': '#93B4FF',
    '#0F766E': '#5EEAD4',
    '#3F3F46': '#D4D4D8',
  };
  try {
    var saved = JSON.parse(localStorage.getItem('kite.appearance') || 'null');
    if (!saved) return;
    var root = document.documentElement;
    var theme = saved.theme;
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    if (inkDark[saved.accent]) {
      root.style.setProperty('--accent', saved.accent);
      root.style.setProperty('--accent-ink-dark', inkDark[saved.accent]);
      root.style.setProperty('--accent-soft-light', saved.accent + '1A');
      root.style.setProperty('--accent-soft-dark', saved.accent + '33');
    }
  } catch {
    // Ignore: falls back to the light default.
  }
})();
