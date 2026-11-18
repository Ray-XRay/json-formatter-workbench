// No-flash theme: set the theme class before first paint.
// Mirrors src/composables/useTheme.ts — storage key 'wb20-theme',
// modes light / dark / system (default: follow OS).
// Kept as a separate same-origin file (loaded synchronously from <head>)
// so the Content-Security-Policy can stay strict: script-src 'self'
// with no 'unsafe-inline' and no 'unsafe-eval' (Vite precompiles templates).
try {
  var stored = localStorage.getItem('wb20-theme')
  var dark =
    stored === 'dark' ||
    (stored !== 'light' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) {
    document.documentElement.classList.add('dark')
  }
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch (e) {
  /* storage / matchMedia unavailable — fall back to light */
}
