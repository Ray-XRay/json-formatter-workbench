// No-flash theme: set data-theme + dark class before first paint.
// Mirrors src/composables/useTheme.ts — storage key 'wb20-theme',
// modes: light / dark / tokyonight / paper / terminal / sakura / system.
// Dark themes (drive the .dark class): dark, tokyonight, terminal.
// Kept as a separate same-origin file (loaded synchronously from <head>)
// so the Content-Security-Policy can stay strict: script-src 'self'
// with no 'unsafe-inline' and no 'unsafe-eval' (Vite precompiles templates).
try {
  var stored = localStorage.getItem('wb20-theme')
  var valid = { light: 1, dark: 1, tokyonight: 1, paper: 1, terminal: 1, sakura: 1 }
  var darkThemes = { dark: 1, tokyonight: 1, terminal: 1 }
  var theme = valid[stored] ? stored : null
  var dark = theme
    ? !!darkThemes[theme]
    : stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches
  var id = theme || (dark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', id)
  if (dark) {
    document.documentElement.classList.add('dark')
  }
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch (e) {
  /* storage / matchMedia unavailable — fall back to light */
}
