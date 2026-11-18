import { ref, type Ref } from 'vue'

const isOpen = ref(false)

export function useCommandPalette(): {
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
