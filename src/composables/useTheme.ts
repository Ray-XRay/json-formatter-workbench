import { computed, ref, type ComputedRef, type Ref } from 'vue'

/** 主题模型（alpha.7 修正版）：6 个主题族 + 每族的深浅变体 + 跟随系统。
 *  用户只在 6 个族里选；4 个特色族各有深/浅两个变体，浅色版是独立的
 *  CSS 主题（main.css 里 10 个 html[data-theme] 块）。有效 id（写到
 *  html[data-theme] 的值）由族 + 变体推导，绝不直接存裸的浅色 id。 */

/** Effective theme id: the value written to `html[data-theme]`. */
export type ThemeId =
  | 'light'
  | 'dark'
  | 'tokyonight'
  | 'catppuccin'
  | 'gruvbox'
  | 'dracula'
  | 'tokyonight-light'
  | 'catppuccin-latte'
  | 'gruvbox-light'
  | 'dracula-light'

/** The 6 families shown in the picker, in list order. */
export type FamilyId = 'light' | 'dark' | 'tokyonight' | 'catppuccin' | 'gruvbox' | 'dracula'
/** The 4 signature families — the only ones with a light/dark variant. */
export type SignatureFamilyId = 'tokyonight' | 'catppuccin' | 'gruvbox' | 'dracula'
export type Variant = 'dark' | 'light'

export function isSignatureFamily(id: FamilyId): id is SignatureFamilyId {
  return id !== 'light' && id !== 'dark'
}

export interface ThemeVariantMeta {
  /** Effective id for this variant. */
  id: ThemeId
  /** True when the variant is dark (drives the `.dark` class + color-scheme). */
  dark: boolean
  /** Swatch colours for the theme picker dot. */
  swatchBg: string
  swatchAccent: string
  /** One-line description shown in the theme picker. */
  blurb: string
}

export interface ThemeFamily {
  id: FamilyId
  /** Chinese display name. */
  label: string
  /** English display name. */
  nameEn: string
  /** Dark variant (null for the plain `light` family). */
  dark: ThemeVariantMeta | null
  /** Light variant (null for the plain `dark` family). */
  light: ThemeVariantMeta | null
}

export const FAMILIES: readonly ThemeFamily[] = [
  {
    id: 'light',
    label: '浅色',
    nameEn: 'Light',
    dark: null,
    light: {
      id: 'light',
      dark: false,
      swatchBg: '#fafafa',
      swatchAccent: '#18181b',
      blurb: '冷灰底 · 纯白卡片',
    },
  },
  {
    id: 'dark',
    label: '深色',
    nameEn: 'Dark',
    dark: {
      id: 'dark',
      dark: true,
      swatchBg: '#09090b',
      swatchAccent: '#fafafa',
      blurb: '深邃炭黑 · 微弱高光边框',
    },
    light: null,
  },
  {
    id: 'tokyonight',
    label: '东京之夜',
    nameEn: 'Tokyo Night',
    dark: {
      id: 'tokyonight',
      dark: true,
      swatchBg: '#1a1b26',
      swatchAccent: '#7aa2f7',
      blurb: '深海军蓝 · 蓝紫点缀',
    },
    light: {
      id: 'tokyonight-light',
      dark: false,
      swatchBg: '#e1e2e7',
      swatchAccent: '#155fc5',
      blurb: '浅灰蓝底 · 蓝紫点缀',
    },
  },
  {
    id: 'catppuccin',
    label: '猫布奇诺',
    nameEn: 'Catppuccin Mocha',
    dark: {
      id: 'catppuccin',
      dark: true,
      swatchBg: '#1e1e2e',
      swatchAccent: '#cba6f7',
      blurb: '摩卡底 · 淡紫粉彩点缀',
    },
    light: {
      id: 'catppuccin-latte',
      dark: false,
      swatchBg: '#e6e9ef',
      swatchAccent: '#8839ef',
      blurb: '奶白底 · 淡紫点缀',
    },
  },
  {
    id: 'gruvbox',
    label: '暖棕复古',
    nameEn: 'Gruvbox Dark',
    dark: {
      id: 'gruvbox',
      dark: true,
      swatchBg: '#282828',
      swatchAccent: '#d65d0e',
      blurb: '暖棕底 · 橙黄点缀',
    },
    light: {
      id: 'gruvbox-light',
      dark: false,
      swatchBg: '#ebdbb2',
      swatchAccent: '#076678',
      blurb: '暖米黄底 · 青蓝点缀',
    },
  },
  {
    id: 'dracula',
    label: '德古拉',
    nameEn: 'Dracula',
    dark: {
      id: 'dracula',
      dark: true,
      swatchBg: '#282a36',
      swatchAccent: '#bd93f9',
      blurb: '深紫底 · 粉紫点缀',
    },
    light: {
      id: 'dracula-light',
      dark: false,
      swatchBg: '#f8f8f2',
      swatchAccent: '#8b41f4',
      blurb: '米白底 · 紫粉点缀',
    },
  },
] as const

export const FAMILY_ORDER: readonly FamilyId[] = FAMILIES.map((f: ThemeFamily): FamilyId => f.id)

/** Effective id for a family + variant (plain families ignore the variant). */
export function effectiveIdFor(family: FamilyId, variant: Variant): ThemeId {
  if (family === 'light') return 'light'
  if (family === 'dark') return 'dark'
  const found = FAMILIES.find((f: ThemeFamily): boolean => f.id === family)
  if (!found) return 'light'
  if (variant === 'dark') return found.dark?.id ?? 'dark'
  return found.light?.id ?? 'light'
}

/** Persisted state: one family + a per-signature-family variant record + follow-system. */
export interface ThemeState {
  family: FamilyId
  variants: Record<SignatureFamilyId, Variant>
  followSystem: boolean
}

const DEFAULT_STATE: ThemeState = {
  family: 'light',
  variants: { tokyonight: 'dark', catppuccin: 'dark', gruvbox: 'dark', dracula: 'dark' },
  followSystem: true,
}

const STORAGE_KEY = 'wb20-theme'
const TRANSITION_CLASS = 'theme-transition'
const TRANSITION_MS = 300

/** Legacy single-id values (pre-alpha.7 storage) → new state. */
const LEGACY_MAP: Record<string, { family: FamilyId; variant?: Variant; followSystem?: boolean }> = {
  'tokyonight-light': { family: 'tokyonight', variant: 'light' },
  'catppuccin-latte': { family: 'catppuccin', variant: 'light' },
  'gruvbox-light': { family: 'gruvbox', variant: 'light' },
  'dracula-light': { family: 'dracula', variant: 'light' },
  tokyonight: { family: 'tokyonight', variant: 'dark' },
  catppuccin: { family: 'catppuccin', variant: 'dark' },
  gruvbox: { family: 'gruvbox', variant: 'dark' },
  dracula: { family: 'dracula', variant: 'dark' },
  light: { family: 'light' },
  dark: { family: 'dark' },
  system: { family: 'light', followSystem: true },
}

function readStoredState(): ThemeState {
  const fresh = (): ThemeState => ({
    family: DEFAULT_STATE.family,
    variants: { ...DEFAULT_STATE.variants },
    followSystem: DEFAULT_STATE.followSystem,
  })
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      // New shape: JSON object { family, variants, followSystem }.
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const p = parsed as Partial<ThemeState>
          if (
            typeof p.family === 'string' &&
            (FAMILY_ORDER as readonly string[]).includes(p.family)
          ) {
            const state = fresh()
            state.family = p.family as FamilyId
            state.followSystem = p.followSystem === true
            if (p.variants && typeof p.variants === 'object') {
              for (const key of Object.keys(state.variants) as SignatureFamilyId[]) {
                const v = (p.variants as Record<string, unknown>)[key]
                if (v === 'dark' || v === 'light') state.variants[key] = v
              }
            }
            return state
          }
        }
      } catch {
        /* not JSON — fall through to the legacy single id */
      }
      const legacy = LEGACY_MAP[raw]
      if (legacy) {
        const state = fresh()
        state.family = legacy.family
        state.followSystem = legacy.followSystem === true
        if (legacy.variant && isSignatureFamily(legacy.family)) {
          state.variants[legacy.family] = legacy.variant
        }
        return state
      }
    }
  } catch {
    /* storage unavailable — fall through to the default (follow system) */
  }
  return fresh()
}

const initial = readStoredState()
const family = ref<FamilyId>(initial.family)
const variants = ref<Record<SignatureFamilyId, Variant>>({ ...initial.variants })
const followSystem = ref<boolean>(initial.followSystem)
const osDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches)

/** The family actually in effect: while following the system, a plain
 *  light/dark family flips with the OS; signature families stay put. */
function effectiveFamilyOf(f: FamilyId): FamilyId {
  if (followSystem.value && !isSignatureFamily(f)) return osDark.value ? 'dark' : 'light'
  return f
}

/** The variant actually in effect for a family (OS-derived while following system). */
function variantOf(f: FamilyId): Variant {
  const ef = effectiveFamilyOf(f)
  if (!isSignatureFamily(ef)) return ef === 'dark' ? 'dark' : 'light'
  if (followSystem.value) return osDark.value ? 'dark' : 'light'
  return variants.value[ef]
}

/** The variant meta actually in effect for a family (swatch + blurb for its row). */
function variantMetaOf(f: FamilyId): ThemeVariantMeta {
  const ef = effectiveFamilyOf(f)
  const found = FAMILIES.find((x: ThemeFamily): boolean => x.id === ef) ?? FAMILIES[0]
  const v = variantOf(f)
  const meta = v === 'dark' ? found.dark : found.light
  return meta ?? found.dark ?? found.light ?? {
    id: 'light',
    dark: false,
    swatchBg: '#fafafa',
    swatchAccent: '#18181b',
    blurb: '冷灰底 · 纯白卡片',
  }
}

const currentFamily = computed<ThemeFamily>((): ThemeFamily => {
  return FAMILIES.find((f: ThemeFamily): boolean => f.id === family.value) ?? FAMILIES[0]
})

/** The theme actually rendered. */
const resolved = computed<ThemeId>((): ThemeId => {
  if (followSystem.value) {
    if (isSignatureFamily(family.value)) {
      return effectiveIdFor(family.value, osDark.value ? 'dark' : 'light')
    }
    return osDark.value ? 'dark' : 'light'
  }
  return effectiveIdFor(family.value, variantOf(family.value))
})

const meta = computed<ThemeVariantMeta>((): ThemeVariantMeta => variantMetaOf(family.value))

const isDark = computed<boolean>((): boolean => meta.value.dark)

function persist(): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        family: family.value,
        variants: variants.value,
        followSystem: followSystem.value,
      }),
    )
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

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
    osDark.value = e.matches
    if (followSystem.value) applyTheme(true)
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
  else mq.addListener(onChange)
}

// Initial paint: public/theme-init.js already set the theme before
// first paint; this is a no-op safety net that keeps DOM and state in sync.
applyTheme(false)

export function useTheme(): {
  family: Ref<FamilyId>
  variants: Ref<Record<SignatureFamilyId, Variant>>
  followSystem: Ref<boolean>
  resolved: ComputedRef<ThemeId>
  meta: ComputedRef<ThemeVariantMeta>
  currentFamily: ComputedRef<ThemeFamily>
  isDark: ComputedRef<boolean>
  variantOf: (f: FamilyId) => Variant
  variantMetaOf: (f: FamilyId) => ThemeVariantMeta
  setFamily: (next: FamilyId) => void
  toggleVariant: () => void
  setFollowSystem: (on: boolean) => void
  cycleMode: () => void
} {
  installMediaListener()

  /** Select a family; a manual choice turns follow-system off. */
  function setFamily(next: FamilyId): void {
    if (next === family.value && !followSystem.value) return
    family.value = next
    if (followSystem.value) followSystem.value = false
    persist()
    applyTheme(true)
  }

  /** Toggle the current signature family's light/dark variant (one click also
   *  turns follow-system off); no-op for the plain light/dark families. */
  function toggleVariant(): void {
    const f = family.value
    if (!isSignatureFamily(f)) return
    variants.value[f] = variants.value[f] === 'dark' ? 'light' : 'dark'
    if (followSystem.value) followSystem.value = false
    persist()
    applyTheme(true)
  }

  /** Follow-system ON applies the OS-matching variant at once; OFF restores
   *  the stored per-family variant (the OS-derived one is never stored). */
  function setFollowSystem(on: boolean): void {
    if (on === followSystem.value) return
    followSystem.value = on
    persist()
    applyTheme(true)
  }

  /** Cycles through the 6 families in list order, preserving each family's
   *  current variant; never touches followSystem, never lands on a bare
   *  light-variant id. */
  function cycleMode(): void {
    const next = FAMILY_ORDER[(FAMILY_ORDER.indexOf(family.value) + 1) % FAMILY_ORDER.length]
    family.value = next
    persist()
    applyTheme(true)
  }

  return {
    family,
    variants,
    followSystem,
    resolved,
    meta,
    currentFamily,
    isDark,
    variantOf,
    variantMetaOf,
    setFamily,
    toggleVariant,
    setFollowSystem,
    cycleMode,
  }
}
