// Keeps the CSS variable --app-height in sync with the *visible* viewport.
//
// Why: `100vh` / `min-h-screen` measure the full window and DON'T shrink when the
// on-screen keyboard opens, so a bottom-pinned chat composer or sheet ends up
// hidden behind the keyboard (and the page scrolls awkwardly). visualViewport
// reports the actual visible area, so driving layout height off it keeps the
// composer and sheets sitting just above the keyboard.
//
// Safe everywhere: visualViewport exists in Chrome 61+ (covers the oldest
// WebViews we target) and the CSS falls back to 100vh if the var is never set.

let started = false;

export function initViewport() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const vv = window.visualViewport;
  const root = document.documentElement;

  const apply = () => {
    const h = vv?.height ?? window.innerHeight;
    if (h > 0) root.style.setProperty('--app-height', `${Math.round(h)}px`);
  };

  apply();

  // visualViewport.resize fires as the keyboard animates in/out; window resize +
  // orientationchange cover browser-chrome (URL bar) changes and rotation.
  vv?.addEventListener('resize', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
