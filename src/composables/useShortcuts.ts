/** Shared shortcut registry (extracted from JsonSqlView in alpha.7).
 *  Module-level state so the JSON view (dispatch), the shared settings
 *  dialog (rebind UI) and AppLayout (global Ctrl+Alt+S) all see one
 *  registry. Persisted under `json-wb-shortcuts`. */
import { ref, type Ref } from 'vue'
import { loadShortcuts, saveShortcuts } from '../lib/jsonsql/storage'
import { useToast } from './useToast'

export interface ShortcutDef {
  id: string
  name: string
  combo: string
  allowEditable: boolean
}

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { id: 'format', name: '格式化', combo: 'ctrl+enter', allowEditable: true },
  { id: 'selectResult', name: '选中格式化结果', combo: 'ctrl+a', allowEditable: false },
  { id: 'copyResult', name: '复制结果（带颜色）', combo: 'ctrl+alt+c', allowEditable: true },
  { id: 'copyMarkdown', name: '复制为 Markdown 代码块', combo: 'ctrl+alt+m', allowEditable: true },
  { id: 'toggleTree', name: '展开 / 折叠全部节点（树形）', combo: 'ctrl+l', allowEditable: true },
  { id: 'openSettings', name: '打开快捷键设置', combo: 'ctrl+alt+s', allowEditable: true },
]

const shortcuts = ref<ShortcutDef[]>(DEFAULT_SHORTCUTS.map((s) => ({ ...s })))
const listeningId = ref<string | null>(null)

const { push } = useToast()

export function useShortcuts(): {
  shortcuts: Ref<ShortcutDef[]>
  listeningId: Ref<string | null>
  loadShortcutsIntoRegistry: () => void
  persistShortcuts: () => void
  comboLabel: (combo: string) => string
  shortcutLabel: (id: string) => string
  comboOf: (id: string) => string
  eventCombo: (e: KeyboardEvent) => string | null
  captureCombo: (e: KeyboardEvent) => void
  resetShortcuts: () => void
  startRebind: (id: string) => void
  cancelRebind: () => void
} {
  function loadShortcutsIntoRegistry(): void {
    const saved = loadShortcuts()
    shortcuts.value = DEFAULT_SHORTCUTS.map((s) => ({
      ...s,
      combo: saved[s.id] ?? s.combo,
    }))
  }

  function persistShortcuts(): void {
    const map: Record<string, string> = {}
    shortcuts.value.forEach((s) => {
      map[s.id] = s.combo
    })
    saveShortcuts(map)
  }

  function comboLabel(combo: string): string {
    return combo
      .split('+')
      .map((p) => {
        if (p === 'ctrl') return 'Ctrl'
        if (p === 'alt') return 'Alt'
        if (p === 'shift') return 'Shift'
        if (p === 'enter') return 'Enter'
        if (p === 'space') return 'Space'
        return p.toUpperCase()
      })
      .join('+')
  }

  function shortcutLabel(id: string): string {
    const s = shortcuts.value.find((x) => x.id === id)
    return s ? comboLabel(s.combo) : ''
  }

  function comboOf(id: string): string {
    const found = DEFAULT_SHORTCUTS.find((s) => s.id === id)
    return shortcuts.value.find((x) => x.id === id)?.combo ?? found?.combo ?? ''
  }

  // Normalize a key event to the registry's combo spelling (Mac Cmd counts as Ctrl).
  function eventCombo(e: KeyboardEvent): string | null {
    const k = (e.key || '').toLowerCase()
    if (k === 'control' || k === 'alt' || k === 'shift' || k === 'meta') return null
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.altKey) parts.push('alt')
    if (e.shiftKey) parts.push('shift')
    parts.push(k === ' ' ? 'space' : k)
    return parts.join('+')
  }

  function startRebind(id: string): void {
    listeningId.value = id
  }

  function cancelRebind(): void {
    listeningId.value = null
  }

  function captureCombo(e: KeyboardEvent): void {
    const combo = eventCombo(e)
    if (!combo) return
    if (combo === 'escape') {
      cancelRebind()
      return
    }
    const parts = combo.split('+')
    // At least Ctrl / Cmd or Alt, or a bare key would steal normal typing
    if (parts.indexOf('ctrl') === -1 && parts.indexOf('alt') === -1) {
      push('组合键至少包含 Ctrl / Cmd 或 Alt')
      return
    }
    const other = shortcuts.value.find((s) => s.combo === combo)
    if (other && other.id !== listeningId.value) {
      push(`已被「${other.name}」占用，换一组试试`)
      return
    }
    shortcuts.value.forEach((s) => {
      if (s.id === listeningId.value) s.combo = combo
    })
    persistShortcuts()
    listeningId.value = null
    push('已保存')
  }

  function resetShortcuts(): void {
    shortcuts.value = DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
    persistShortcuts()
    push('已恢复默认快捷键')
  }

  return {
    shortcuts,
    listeningId,
    loadShortcutsIntoRegistry,
    persistShortcuts,
    comboLabel,
    shortcutLabel,
    comboOf,
    eventCombo,
    captureCombo,
    resetShortcuts,
    startRebind,
    cancelRebind,
  }
}
