import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'wb20-theme'
const TRANSITION_CLASS = 'theme-transition'
const TRANSITION_MS = 300

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable — fall through to system */
  }
  return 'system'
}

const mode = ref<ThemeMode>(readStoredMode())
const systemDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches)

/** The theme actually rendered: explicit choice, or the OS preference when on System. */
const resolved = computed<ResolvedTheme>((): ResolvedTheme =>
  mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
)

function applyTheme(animate: boolean): void {
  const root = document.documentElement
  if (animate) {
    // Enables the smooth colour/background/border fade defined in main.css.
    root.classList.add(TRANSITION_CLASS)
    window.setTimeout((): void => {
      root.classList.remove(TRANSITION_CLASS)
    }, TRANSITION_MS)
  }
  root.classList.toggle('dark', resolved.value === 'dark')
  root.style.colorScheme = resolved.value
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

// Initial paint: the inline script in index.html already set the class before
// first paint; this is a no-op safety net that keeps DOM and state in sync.
applyTheme(false)

export function useTheme(): {
  mode: Ref<ThemeMode>
  resolved: ComputedRef<ResolvedTheme>
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

  /** Light -> Dark -> System -> Light (top-bar toggle button). */
  function cycleMode(): void {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(mode.value) + 1) % order.length]
    setMode(next as ThemeMode)
  }

  return { mode, resolved, setMode, cycleMode }
}
