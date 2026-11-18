<script setup lang="ts">
import { Check, ChevronDown, Monitor } from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { THEMES, useTheme, type ThemeMode } from '../composables/useTheme'

const { mode, meta, setMode } = useTheme()

function onSelect(value: unknown): void {
  if (typeof value !== 'string') return
  setMode(value as ThemeMode)
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        aria-label="切换主题"
        :title="mode === 'system' ? '主题：跟随系统' : `主题：${meta.label}`"
        class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span
          class="h-3.5 w-3.5 shrink-0 rounded-full border"
          :style="{
            backgroundColor: meta.swatchBg,
            borderColor: meta.swatchAccent,
          }"
        />
        <span class="hidden font-medium md:inline">
          {{ mode === 'system' ? '跟随系统' : meta.label }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        class="dropdown-content z-50 min-w-60 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
        :side-offset="6"
        align="end"
      >
        <DropdownMenuLabel class="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
          主题
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup :model-value="mode" @update:model-value="onSelect">
          <DropdownMenuRadioItem
            v-for="theme in THEMES"
            :key="theme.id"
            :value="theme.id"
            class="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-accent"
          >
            <span
              class="h-4 w-4 shrink-0 rounded-full border"
              :style="{
                backgroundColor: theme.swatchBg,
                borderColor: theme.swatchAccent,
              }"
            />
            <span class="flex-1">
              <span class="block leading-tight">{{ theme.label }}</span>
              <span class="block text-xs leading-tight text-muted-foreground">
                {{ theme.nameEn }} · {{ theme.blurb }}
              </span>
            </span>
            <DropdownMenuItemIndicator>
              <Check class="h-4 w-4 shrink-0" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>

          <DropdownMenuSeparator class="my-1 h-px bg-border" />

          <DropdownMenuRadioItem
            value="system"
            class="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-accent"
          >
            <Monitor class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="flex-1">
              <span class="block leading-tight">跟随系统</span>
              <span class="block text-xs leading-tight text-muted-foreground">
                System · 自动跟随深浅色
              </span>
            </span>
            <DropdownMenuItemIndicator>
              <Check class="h-4 w-4 shrink-0" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
