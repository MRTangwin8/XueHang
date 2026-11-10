import { ref } from 'vue'
import axios from 'axios'

export interface VersionInfo { version: string; commit: string; builtAt: string }

/** 服务端版本信息（来自 /api/health）；只在教职工端显示，学生端不显示 */
const info = ref<VersionInfo | null>(null)
let started = false

export function useVersion() {
  if (!started) {
    started = true
    axios.get<VersionInfo>('/api/health', { timeout: 8000 }).then((r) => {
      if (r.data?.version) info.value = { version: r.data.version, commit: r.data.commit ?? '', builtAt: r.data.builtAt ?? '' }
    }).catch(() => undefined)
  }
  return info
}

/** 例：v1.0.0 (76d3520) */
export const versionText = (v: VersionInfo | null) => (v ? `v${v.version}${v.commit ? ` (${v.commit})` : ''}` : '')
