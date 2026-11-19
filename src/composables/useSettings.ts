/** Shared settings dialog state (alpha.7, Change 1).
 *  One dialog hosted in AppLayout, opened globally by Ctrl+Alt+S on all
 *  four tools. Clearing history is a window event so each view refreshes
 *  its own UI; the dialog also removes the storage keys directly, so
 *  "全部清除" works even for tools that are not currently mounted. */
import { ref, type Ref } from 'vue'

export type ClearScope = 'json' | 'qr' | 'gmb' | 'all'

export const CLEAR_HISTORY_EVENT = 'wb:clear-history'

const isOpen = ref(false)

export function useSettings(): {
  isOpen: Ref<boolean>
  open: () => void
  close: () => void
  toggle: () => void
} {
  return {
    isOpen,
    open: (): void => {
      isOpen.value = true
    },
    close: (): void => {
      isOpen.value = false
    },
    toggle: (): void => {
      isOpen.value = !isOpen.value
    },
  }
}

export function dispatchClearHistory(scope: ClearScope): void {
  window.dispatchEvent(new CustomEvent(CLEAR_HISTORY_EVENT, { detail: { scope } }))
}
