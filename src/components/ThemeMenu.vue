<script setup lang="ts">
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui'
import {
  FAMILIES,
  isSignatureFamily,
  useTheme,
  type FamilyId,
} from '../composables/useTheme'

const {
  family,
  followSystem,
  resolved,
  meta,
  currentFamily,
  variantOf,
  variantMetaOf,
  setFamily,
  toggleVariant,
  setFollowSystem,
} = useTheme()

/** Row click semantics (user's rules):
 *  - non-active family: select it (manual choice turns follow-system off);
 *  - active signature family: toggle its light/dark variant (also turns follow-system off);
 *  - active plain family: confirm it as the manual choice (follow-system off, else no-op). */
function onFamilyClick(f: FamilyId): void {
  if (f !== family.value) setFamily(f)
  else if (isSignatureFamily(f)) toggleVariant()
  else setFollowSystem(false)
}

function triggerLabel(): string {
  if (isSignatureFamily(family.value)) {
    return `${currentFamily.value.label} · ${variantOf(family.value) === 'light' ? '浅色' : '深色'}`
  }
  return resolved.value === 'dark' ? '深色' : '浅色'
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        aria-label="切换主题"
        :title="followSystem ? `主题：${triggerLabel()}（跟随系统）` : `主题：${triggerLabel()}`"
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
          {{ triggerLabel() }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        class="dropdown-content z-50 max-h-[min(70vh,32rem)] w-[min(15rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
        :side-offset="6"
        align="end"
      >
        <DropdownMenuLabel class="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
          主题
        </DropdownMenuLabel>

        <DropdownMenuItem
          v-for="f in FAMILIES"
          :key="f.id"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-accent"
          @click="onFamilyClick(f.id)"
        >
          <span
            class="h-4 w-4 shrink-0 rounded-full border"
            :style="{
              backgroundColor: variantMetaOf(f.id).swatchBg,
              borderColor: variantMetaOf(f.id).swatchAccent,
            }"
          />
          <span class="min-w-0 flex-1">
            <span class="block leading-tight">{{ f.label }}</span>
            <span class="block text-xs leading-tight text-muted-foreground">
              {{ f.nameEn }} · {{ variantMetaOf(f.id).blurb }}
            </span>
          </span>
          <span
            v-if="isSignatureFamily(f.id)"
            class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          >
            <Sun v-if="variantOf(f.id) === 'light'" class="h-3.5 w-3.5" />
            <Moon v-else class="h-3.5 w-3.5" />
            {{ variantOf(f.id) === 'light' ? '浅色' : '深色' }}
          </span>
          <Check v-if="family === f.id" class="h-4 w-4 shrink-0" />
        </DropdownMenuItem>

        <DropdownMenuSeparator class="my-1 h-px bg-border" />

        <div class="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm">
          <Monitor class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block leading-tight">跟随系统</span>
            <span class="block text-xs leading-tight text-muted-foreground">
              System · 自动跟随深浅色
            </span>
          </span>
          <SwitchRoot
            :model-value="followSystem"
            aria-label="跟随系统"
            class="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-muted transition-colors data-[state=checked]:bg-primary"
            @update:model-value="setFollowSystem"
          >
            <SwitchThumb
              class="block h-4 w-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4"
            />
          </SwitchRoot>
        </div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
