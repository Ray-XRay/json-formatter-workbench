import { shallowRef, type Ref } from 'vue'

/**
 * 可拖拽区块布局（通用）：一个工具的区块顺序存在 localStorage，
 * 读入时校验（丢弃未知 id、补齐缺失 id），其余工具复用同一套 API。
 * 顺序数组就是唯一事实来源；上/下移与拖拽都只改这个数组，不动 DOM。
 */
export interface BlockLayoutApi<T extends string> {
  /** 完整顺序（含当前不可见的区块，位置保留、切回来原地出现）。 */
  order: Ref<T[]>
  /** 与上一项交换位置（已在首位时不动）。 */
  moveUp: (id: T) => void
  /** 与下一项交换位置（已在末位时不动）。 */
  moveDown: (id: T) => void
  /** 交换任意两项的位置。 */
  swap: (a: T, b: T) => void
  /** 把 id 移到 targetId 之前；targetId 为 null 时移到末尾。 */
  moveBefore: (id: T, targetId: T | null) => void
  /** 把 id 移到 targetId 紧后一位。 */
  moveAfter: (id: T, targetId: T) => void
  /** 恢复默认顺序。 */
  resetToDefault: () => void
}

/** 读入并校验：只留已知 id（去重）、缺失的按默认顺序补在末尾。 */
function loadOrder<T extends string>(
  storageKey: string,
  defaultOrder: readonly T[],
): T[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    // 私隱模式等读不到时用默认顺序
  }
  if (raw === null) return [...defaultOrder]
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [...defaultOrder]
  }
  if (!Array.isArray(parsed)) return [...defaultOrder]
  const known = new Set<string>(defaultOrder)
  const out: T[] = []
  for (const item of parsed) {
    if (typeof item === 'string' && known.has(item) && !out.includes(item as T)) {
      out.push(item as T)
    }
  }
  for (const id of defaultOrder) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function useBlockLayout<T extends string>(
  storageKey: string,
  defaultOrder: readonly T[],
): BlockLayoutApi<T> {
  // shallowRef：不解包泛型 T，order.value 就是 T[]；
  // 每次改動都換一個新數組（不可變更新），淺響應也能觸發重渲染。
  const order: Ref<T[]> = shallowRef<T[]>(loadOrder(storageKey, defaultOrder))

  function save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(order.value))
    } catch {
      // 私隱模式等写不进去时忽略（本次会话内顺序照常用）
    }
  }

  // 校验后顺序与存量不一致（丢了未知 id 或补了缺失 id）时写回一次，
  // 下次读入直接就是干净的；一致时不重复写。
  try {
    if (localStorage.getItem(storageKey) !== JSON.stringify(order.value)) save()
  } catch {
    // 读不到就不写回
  }

  function moveUp(id: T): void {
    const i = order.value.indexOf(id)
    if (i > 0) {
      const next = [...order.value]
      next[i - 1] = id
      next[i] = order.value[i - 1]
      order.value = next
      save()
    }
  }

  function moveDown(id: T): void {
    const i = order.value.indexOf(id)
    if (i >= 0 && i < order.value.length - 1) {
      const next = [...order.value]
      next[i + 1] = id
      next[i] = order.value[i + 1]
      order.value = next
      save()
    }
  }

  function swap(a: T, b: T): void {
    if (a === b) return
    const ia = order.value.indexOf(a)
    const ib = order.value.indexOf(b)
    if (ia < 0 || ib < 0) return
    const next = [...order.value]
    next[ia] = b
    next[ib] = a
    order.value = next
    save()
  }

  function moveBefore(id: T, targetId: T | null): void {
    if (id === targetId) return
    const i = order.value.indexOf(id)
    if (i < 0) return
    const next = [...order.value]
    next.splice(i, 1)
    if (targetId === null) {
      next.push(id)
    } else {
      const t = next.indexOf(targetId)
      if (t < 0) next.push(id)
      else next.splice(t, 0, id)
    }
    order.value = next
    save()
  }

  function moveAfter(id: T, targetId: T): void {
    if (id === targetId) return
    const i = order.value.indexOf(id)
    if (i < 0) return
    const next = [...order.value]
    next.splice(i, 1)
    const t = next.indexOf(targetId)
    if (t < 0) next.push(id)
    else next.splice(t + 1, 0, id)
    order.value = next
    save()
  }

  function resetToDefault(): void {
    order.value = [...defaultOrder]
    save()
  }

  return { order, moveUp, moveDown, swap, moveBefore, moveAfter, resetToDefault }
}
