/** 到站看板「第二條路線（換乘）」開關：預設關，存在 localStorage。
 *  設定弹窗（WbSettingsDialog）與看板（GmbView）共用同一份響應式狀態；
 *  開關只控制 road2 區塊是否顯示，區塊在拖拽順序裡的位置始終保留。 */
import { computed, ref, type ComputedRef } from 'vue'

const ROAD2_ENABLED_KEY = 'wb20-gmb-road2-enabled'

function readRoad2Enabled(): boolean {
  try {
    return window.localStorage.getItem(ROAD2_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

const road2EnabledInner = ref(
  typeof window === 'undefined' ? false : readRoad2Enabled(),
)

const road2Enabled = computed<boolean>({
  get: () => road2EnabledInner.value,
  set: (v: boolean) => {
    road2EnabledInner.value = v
    try {
      window.localStorage.setItem(ROAD2_ENABLED_KEY, v ? '1' : '0')
    } catch {
      // 私隱模式等寫不進去也不影響當次使用
    }
  },
})

export function useGmbRoad2Enabled(): { road2Enabled: ComputedRef<boolean> } {
  return { road2Enabled }
}
