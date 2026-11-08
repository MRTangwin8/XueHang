import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { cleanParams } from './api'

/**
 * 列表筛选 + 分页同步到 URL query（刷新 / 翻页不丢条件）。
 * const uf = useUrlFilters(['q','status'], ['campusId'], (params) => load(params))；uf.reload() 重新加载当前页
 */
export function useUrlFilters(strKeys: string[], numKeys: string[], loader: (params: Record<string, unknown>) => void) {
  const route = useRoute()
  const router = useRouter()
  const myPath = route.path
  const filters = reactive<Record<string, string | number | undefined>>({})
  const page = ref(1)
  const pageSize = ref(20)
  const params = () => cleanParams({ ...filters, page: page.value, pageSize: pageSize.value })
  const load = () => loader(params())

  function read() {
    const q = route.query
    for (const k of strKeys) filters[k] = typeof q[k] === 'string' && q[k] ? (q[k] as string) : undefined
    for (const k of numKeys) filters[k] = q[k] ? Number(q[k]) || undefined : undefined
    page.value = Number(q.page) || 1
    pageSize.value = Number(q.pageSize) || 20
  }

  function push(p = 1, ps = pageSize.value) {
    const query: LocationQueryRaw = { ...(cleanParams({ ...filters }) as LocationQueryRaw) }
    if (p > 1) query.page = String(p)
    if (ps !== 20) query.pageSize = String(ps)
    const same = JSON.stringify(cleanParams(query as Record<string, unknown>)) === JSON.stringify(cleanParams({ ...route.query }))
    if (same) load()
    else router.replace({ query })
  }

  watch(
    () => route.query,
    () => {
      if (route.path !== myPath) return
      read()
      load()
    },
    { immediate: true },
  )

  /** el-date-picker daterange 绑定（from / to） */
  const range = computed<[string, string] | null>({
    get: (): [string, string] | null => (filters.from && filters.to ? [String(filters.from), String(filters.to)] : null),
    set: (v: [string, string] | null) => {
      filters.from = v?.[0]
      filters.to = v?.[1]
    },
  })

  return {
    filters,
    page,
    pageSize,
    range,
    params,
    reload: load,
    search: () => push(1),
    reset: () => {
      for (const k of [...strKeys, ...numKeys]) filters[k] = undefined
      push(1)
    },
    setPage: (p: number) => push(p),
    setSize: (s: number) => push(1, s),
  }
}
