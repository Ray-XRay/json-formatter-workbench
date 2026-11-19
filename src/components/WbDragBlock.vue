<script setup lang="ts">
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-vue-next'

/**
 * 可拖拽区块外壳（通用）：给每个区块一排小工具条——左侧拖曳手柄
 * （桌面鼠标拖拽用）、右侧上/下移按钮（手机主路径，也是键盘/无障碍路径）。
 * 拖拽状态（正在拖哪个、落在哪）由父组件持有，这里只负责发事件。
 */
const props = defineProps<{
  /** 区块 id（拖拽时写进 dataTransfer，Firefox 要求 dragstart 里 setData）。 */
  blockId: string
  /** 区块名：工具条上显示，也进按钮的 aria-label。 */
  label: string
  canMoveUp: boolean
  canMoveDown: boolean
  /** 是否正在被拖拽（半透明反馈）。 */
  isDragging: boolean
  /** 落点指示：null 不显示，'before' 在上方、'after' 在下方画一条线。 */
  dropPosition: 'before' | 'after' | null
}>()

const emit = defineEmits<{
  (e: 'move-up'): void
  (e: 'move-down'): void
  (e: 'drag-start'): void
  (e: 'drag-end'): void
  (e: 'drag-over', event: DragEvent): void
  (e: 'drag-leave', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
}>()

function onDragStart(e: DragEvent): void {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', props.blockId)
  }
  emit('drag-start')
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  emit('drag-over', e)
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  emit('drop', e)
}
</script>

<template>
  <div
    class="wb-drag-block"
    :class="{ 'wb-drag-block--dragging': isDragging }"
    @dragover="onDragOver"
    @dragleave="$emit('drag-leave', $event)"
    @drop="onDrop"
  >
    <div v-if="dropPosition === 'before'" class="mb-1.5 h-0.5 rounded-full bg-primary" aria-hidden="true" />
    <!-- 区块工具条：手柄只在 sm 以上显示（触屏上拖拽不可用，按钮是主路径）；
         上/下移按钮手机 44px、桌面 32px。 -->
    <div class="mb-1.5 flex items-center gap-1">
      <span
        class="hidden cursor-grab touch-none select-none items-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing sm:inline-flex"
        draggable="true"
        aria-hidden="true"
        title="拖曳以重新排序"
        @dragstart="onDragStart"
        @dragend="$emit('drag-end')"
      >
        <GripVertical class="h-4 w-4" />
      </span>
      <span class="text-xs text-muted-foreground">{{ label }}</span>
      <span class="flex-1" />
      <button
        type="button"
        class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 sm:h-8 sm:w-8"
        :disabled="!canMoveUp"
        :aria-label="`將「${label}」上移`"
        title="上移"
        @click="$emit('move-up')"
      >
        <ChevronUp class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 sm:h-8 sm:w-8"
        :disabled="!canMoveDown"
        :aria-label="`將「${label}」下移`"
        title="下移"
        @click="$emit('move-down')"
      >
        <ChevronDown class="h-4 w-4" />
      </button>
    </div>
    <slot />
    <div v-if="dropPosition === 'after'" class="mt-1.5 h-0.5 rounded-full bg-primary" aria-hidden="true" />
  </div>
</template>

<style scoped>
/* 被拖的区块：半透明反馈。不加 transition/animation，
   prefers-reduced-motion 的用户也不会看到拖拽动画。 */
.wb-drag-block--dragging {
  opacity: 0.45;
}
</style>
