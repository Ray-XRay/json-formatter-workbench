import { ref, type Ref } from 'vue'

export interface ToastItem {
  id: number
  message: string
}

const TOAST_TTL_MS = 3000

let nextId = 1
const toasts = ref<ToastItem[]>([])

export function useToast(): {
  toasts: Ref<ToastItem[]>
  push: (message: string) => void
  dismiss: (id: number) => void
} {
  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t: ToastItem): boolean => t.id !== id)
  }

  function push(message: string): void {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message }]
    window.setTimeout((): void => {
      dismiss(id)
    }, TOAST_TTL_MS)
  }

  return { toasts, push, dismiss }
}
