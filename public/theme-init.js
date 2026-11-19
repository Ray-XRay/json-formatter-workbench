// No-flash theme: set data-theme + dark class before first paint.
// Mirrors src/composables/useTheme.ts — storage key 'wb20-theme'.
// Stored value is either the NEW shape (JSON: {family, variants, followSystem})
// or a LEGACY single theme id (light / dark / tokyonight / catppuccin /
// gruvbox / dracula / tokyonight-light / catppuccin-latte / gruvbox-light /
// dracula-light / system). Effective id: family + variant (signature families
// only); when followSystem is on, the variant — or, for the plain light/dark
// families, the family itself — follows the OS. Dark effective ids (drive the
// .dark class): dark, tokyonight, catppuccin, gruvbox, dracula.
// Kept as a separate same-origin file (loaded synchronously from <head>)
// so the Content-Security-Policy can stay strict: script-src 'self'
// with no 'unsafe-inline' and no 'unsafe-eval' (Vite precompiles templates).
try {
  var stored = localStorage.getItem('wb20-theme')
  var validFamilies = { light: 1, dark: 1, tokyonight: 1, catppuccin: 1, gruvbox: 1, dracula: 1 }
  var signature = { tokyonight: 1, catppuccin: 1, gruvbox: 1, dracula: 1 }
  var variants = { tokyonight: 'dark', catppuccin: 'dark', gruvbox: 'dark', dracula: 'dark' }
  var family = 'light'
  var followSystem = true
  var legacy = {
    'tokyonight-light': ['tokyonight', 'light'],
    'catppuccin-latte': ['catppuccin', 'light'],
    'gruvbox-light': ['gruvbox', 'light'],
    'dracula-light': ['dracula', 'light'],
    tokyonight: ['tokyonight', 'dark'],
    catppuccin: ['catppuccin', 'dark'],
    gruvbox: ['gruvbox', 'dark'],
    dracula: ['dracula', 'dark'],
    light: ['light', null],
    dark: ['dark', null],
    system: ['light', null],
  }
  var lightIds = {
    tokyonight: 'tokyonight-light',
    catppuccin: 'catppuccin-latte',
    gruvbox: 'gruvbox-light',
    dracula: 'dracula-light',
  }
  if (stored) {
    var parsed = null
    try {
      parsed = JSON.parse(stored)
    } catch (e) {
      parsed = null
    }
    if (parsed && typeof parsed === 'object' && validFamilies[parsed.family]) {
      family = parsed.family
      followSystem = parsed.followSystem === true
      if (parsed.variants) {
        for (var k in variants) {
          if (parsed.variants[k] === 'dark' || parsed.variants[k] === 'light') {
            variants[k] = parsed.variants[k]
          }
        }
      }
    } else if (legacy[stored]) {
      var leg = legacy[stored]
      family = leg[0]
      if (leg[1]) variants[family] = leg[1]
      followSystem = stored === 'system'
    }
  }
  var osDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  var variant = signature[family]
    ? followSystem
      ? osDark
        ? 'dark'
        : 'light'
      : variants[family]
    : family === 'dark'
      ? 'dark'
      : 'light'
  var id
  var dark
  if (signature[family]) {
    id = variant === 'dark' ? family : lightIds[family]
    dark = variant === 'dark'
  } else if (followSystem) {
    id = osDark ? 'dark' : 'light'
    dark = osDark
  } else {
    id = family
    dark = family === 'dark'
  }
  document.documentElement.setAttribute('data-theme', id)
  if (dark) {
    document.documentElement.classList.add('dark')
  }
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch (e) {
  /* storage / matchMedia unavailable — fall back to light */
}
