/** 选项持久化：只记选项，不记密码/助记词/随机数（1.x password.js 的同名逻辑迁移）。
    localStorage 键名与 1.x 完全一致：'pw-wb-options'。
    注意：PasswordOptions 里不许出现 password / mnemonic / numbers 这类键。 */

export type PasswordMode = 'random' | 'mnemonic' | 'number'

export interface PasswordOptions {
  mode: PasswordMode
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
  mnemonicWords: number
  numMin: number
  numMax: number
  numCount: number
  numPad: boolean
  numPadDigits: number
}

export const OPTS_KEY = 'pw-wb-options'
export const SPLIT_KEY = 'pw-wb-split'
export const SPLIT_KEY_V = 'pw-wb-split-v'

export const DEFAULT_OPTIONS: PasswordOptions = {
  mode: 'random',
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  mnemonicWords: 12,
  numMin: 1,
  numMax: 100,
  numCount: 5,
  numPad: false,
  numPadDigits: 4,
}

export function clampOptions(o: PasswordOptions): PasswordOptions {
  return {
    mode: o.mode === 'mnemonic' || o.mode === 'number' ? o.mode : 'random',
    length: Math.min(64, Math.max(8, Math.floor(o.length) || 16)),
    upper: o.upper,
    lower: o.lower,
    digits: o.digits,
    symbols: o.symbols,
    excludeAmbiguous: o.excludeAmbiguous,
    mnemonicWords: [12, 15, 18, 21, 24].indexOf(o.mnemonicWords) !== -1 ? o.mnemonicWords : 12,
    numMin: Math.floor(o.numMin) || 0,
    numMax: Math.floor(o.numMax) || 0,
    numCount: Math.min(10, Math.max(1, Math.floor(o.numCount) || 5)),
    numPad: o.numPad,
    numPadDigits: Math.min(10, Math.max(1, Math.floor(o.numPadDigits) || 4)),
  }
}

export function saveOptions(o: PasswordOptions): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(clampOptions(o)))
  } catch {
    /* 隐私模式等写不进 localStorage 时静默忽略 */
  }
}

export function restoreOptions(): PasswordOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY)
    if (!raw) return { ...DEFAULT_OPTIONS }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_OPTIONS }
    const o = parsed as Partial<PasswordOptions>
    const merged: PasswordOptions = { ...DEFAULT_OPTIONS }
    if (o.mode === 'random' || o.mode === 'mnemonic' || o.mode === 'number') merged.mode = o.mode
    if (typeof o.length === 'number') merged.length = o.length
    if (typeof o.upper === 'boolean') merged.upper = o.upper
    if (typeof o.lower === 'boolean') merged.lower = o.lower
    if (typeof o.digits === 'boolean') merged.digits = o.digits
    if (typeof o.symbols === 'boolean') merged.symbols = o.symbols
    if (typeof o.excludeAmbiguous === 'boolean') merged.excludeAmbiguous = o.excludeAmbiguous
    if (typeof o.mnemonicWords === 'number') merged.mnemonicWords = o.mnemonicWords
    if (typeof o.numMin === 'number') merged.numMin = o.numMin
    if (typeof o.numMax === 'number') merged.numMax = o.numMax
    if (typeof o.numCount === 'number') merged.numCount = o.numCount
    if (typeof o.numPad === 'boolean') merged.numPad = o.numPad
    if (typeof o.numPadDigits === 'number') merged.numPadDigits = o.numPadDigits
    return clampOptions(merged)
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}
