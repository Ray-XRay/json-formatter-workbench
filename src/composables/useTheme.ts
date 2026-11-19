import { computed, ref, type ComputedRef, type Ref } from 'vue'

/** Signature themes. `light` / `dark` are the spec defaults; the rest are
 *  signature themes with their own accent and syntax colours. */
export type ThemeId = 'light' | 'dark' | 'tokyonight' | 'catppuccin' | 'gruvbox' | 'dracula'
/** What the user picks: a theme, or follow the OS. */
export type ThemeMode = ThemeId | 'system'

export interface ThemeMeta {
  /** English identifier (stored in localStorage). */
  id: ThemeId
  /** Chinese display name. */
  label: string
  /** English display name. */
  nameEn: string
  /** True when the theme is dark (drives the `.dark` class + color-scheme). */
  dark: boolean
  /** Swatch colours for the theme picker dot. */
  swatchBg: string
  swatchAccent: string
  /** One-line description shown in the theme picker. */
  blurb: string
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'light',
    label: '浅色',
    nameEn: 'Light',
    dark: false,
    swatchBg: '#fafafa',
    swatchAccent: '#18181b',
    blurb: '冷灰底 · 纯白卡片',
  },
  {
    id: 'dark',
    label: '深色',
    nameEn: 'Dark',
    dark: true,
    swatchBg: '#09090b',
    swatchAccent: '#fafafa',
    blurb: '深邃炭黑 · 微弱高光边框',
  },
  {
    id: 'tokyonight',
    label: '东京之夜',
    nameEn: 'Tokyo Night',
    dark: true,
    swatchBg: '#1a1b26',
    swatchAccent: '#7aa2f7',
    blurb: '深海军蓝 · 蓝紫点缀',
  },
  {
    id: 'catppuccin',
    label: '猫布奇诺',
    nameEn: 'Catppuccin Mocha',
    dark: true,
    swatchBg: '#1e1e2e',
    swatchAccent: '#cba6f7',
    blurb: '摩卡底 · 淡紫粉彩点缀',
  },
  {
    id: 'gruvbox',
    label: '暖棕复古',
    nameEn: 'Gruvbox Dark',
    dark: true,
    swatchBg: '#282828',
    swatchAccent: '#d65d0e',
    blurb: '暖棕底 · 橙黄点缀',
  },
  {
    id: 'dracula',
    label: '德古拉',
    nameEn: 'Dracula',
    dark: true,
    swatchBg: '#282a36',
    swatchAccent: '#bd93f9',
    blurb: '深紫底 · 粉紫点缀',
  },
] as const

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t: ThemeMeta): ThemeId => t.id)
export const THEME_MODES: readonly ThemeMode[] = [...THEME_IDS, 'system']

const STORAGE_KEY = 'wb20-theme'
const TRANSITION_CLASS = 'theme-transition'
const TRANSITION_MS = 300

function isThemeMode(v: string | null): v is ThemeMode {
  return v !== null && (THEME_MODES as readonly string[]).includes(v)
}

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (isThemeMode(v)) return v
  } catch {
    /* storage unavailable — fall through to system */
  }
  return 'system'
}

const mode = ref<ThemeMode>(readStoredMode())
const systemDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches)

/** The theme actually rendered: explicit choice, or the OS preference when on System. */
const resolved = computed<ThemeId>((): ThemeId =>
  mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
)

const meta = computed<ThemeMeta>((): ThemeMeta => {
  const found = THEMES.find((t: ThemeMeta): boolean => t.id === resolved.value)
  return found ?? THEMES[0]
})

const isDark = computed<boolean>((): boolean => meta.value.dark)

function applyTheme(animate: boolean): void {
  const root = document.documentElement
  // No colour fade under reduced motion — the theme still switches instantly.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (animate && !reduceMotion) {
    // Enables the smooth colour/background/border fade defined in main.css.
    root.classList.add(TRANSITION_CLASS)
    window.setTimeout((): void => {
      root.classList.remove(TRANSITION_CLASS)
    }, TRANSITION_MS)
  }
  root.setAttribute('data-theme', resolved.value)
  root.classList.toggle('dark', meta.value.dark)
  root.style.colorScheme = meta.value.dark ? 'dark' : 'light'
}

let mediaListenerInstalled = false

function installMediaListener(): void {
  if (mediaListenerInstalled) return
  mediaListenerInstalled = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (e: MediaQueryListEvent): void => {
    systemDark.value = e.matches
    if (mode.value === 'system') applyTheme(true)
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
  else mq.addListener(onChange)
}

// Initial paint: public/theme-init.js already set the theme before
// first paint; this is a no-op safety net that keeps DOM and state in sync.
applyTheme(false)

export function useTheme(): {
  mode: Ref<ThemeMode>
  resolved: ComputedRef<ThemeId>
  meta: ComputedRef<ThemeMeta>
  isDark: ComputedRef<boolean>
  setMode: (next: ThemeMode) => void
  cycleMode: () => void
} {
  installMediaListener()

  function setMode(next: ThemeMode): void {
    if (next === mode.value) return
    mode.value = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    applyTheme(true)
  }

  /** Cycles through every mode (top-bar menu also offers direct picking). */
  function cycleMode(): void {
    const order: ThemeMode[] = [...THEME_IDS, 'system']
    const next = order[(order.indexOf(mode.value) + 1) % order.length]
    setMode(next as ThemeMode)
  }

  return { mode, resolved, meta, isDark, setMode, cycleMode }
}
