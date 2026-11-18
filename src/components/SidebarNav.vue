<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Braces, BusFront, KeyRound, QrCode, type LucideIcon } from 'lucide-vue-next'
import { cn } from '../lib/utils'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'JSON / SQL 工作台', to: '/json-sql', icon: Braces },
  { label: '密码与助记词', to: '/password', icon: KeyRound },
  { label: 'QR / 条码', to: '/qr-barcode', icon: QrCode },
  { label: '到站看板', to: '/gmb', icon: BusFront },
]

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })
defineEmits<{ (e: 'navigate'): void }>()

const route = useRoute()

function isActive(to: string): boolean {
  return route.path === to
}
</script>

<template>
  <nav aria-label="工具" class="flex-1 space-y-1 overflow-y-auto p-2">
    <p
      v-if="!collapsed"
      class="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
    >
      工具
    </p>
    <RouterLink
      v-for="item in NAV_ITEMS"
      :key="item.to"
      :to="item.to"
      :title="item.label"
      :aria-current="isActive(item.to) ? 'page' : undefined"
      :class="
        cn(
          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all',
          collapsed && 'justify-center px-0',
          isActive(item.to)
            ? 'bg-accent font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-[0.98]',
        )
      "
      @click="$emit('navigate')"
    >
      <span
        v-if="isActive(item.to)"
        class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
      />
      <component
        :is="item.icon"
        :class="cn('h-[18px] w-[18px] shrink-0', isActive(item.to) && 'text-primary')"
      />
      <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
