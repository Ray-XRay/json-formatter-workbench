import { ref, type Ref } from 'vue'

const collapsed = ref(false)
const mobileOpen = ref(false)

export function useSidebar(): {
  collapsed: Ref<boolean>
  mobileOpen: Ref<boolean>
  toggleCollapsed: () => void
  openMobile: () => void
  closeMobile: () => void
  toggleMobile: () => void
} {
  return {
    collapsed,
    mobileOpen,
    toggleCollapsed: (): void => {
      collapsed.value = !collapsed.value
    },
    openMobile: (): void => {
      mobileOpen.value = true
    },
    closeMobile: (): void => {
      mobileOpen.value = false
    },
    toggleMobile: (): void => {
      mobileOpen.value = !mobileOpen.value
    },
  }
}
