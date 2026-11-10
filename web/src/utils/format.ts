import { useDict } from '@/stores/dict'
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { getToken } from '@/api/http'

/** 金额显示：money(580000, 'JPY') → ¥580,000 / money(100,'CNY') → ￥100 */
/**
 * 金额显示：JPY → ¥1,000；CNY → ￥1,000；其他（后台自定义的货币文字，如「港币」）→ 1,000 港币
 */
export function money(v: number | null | undefined, currency = 'JPY'): string {
  if (v == null) return ''
  const n = Math.round(v).toLocaleString('en-US')
  if (currency === 'JPY') return `¥${n}`
  if (currency === 'CNY') return `￥${n}`
  return `${n} ${currency}`
}

/** 货币的名称：JPY / CNY 按界面语言翻译，自定义文字原样返回 */
export function currencyName(currency: string | null | undefined): string {
  if (!currency) return ''
  return useDict().label('currencies', currency)
}

/** 打印费金额（货币见「业务规则 → 货币 / 单位」） */
export const printMoney = (v: number | null | undefined) => money(v, useDict().rules?.printCurrency || 'JPY')
/** 工资金额（时薪、交通费、工资申报） */
export const wageMoney = (v: number | null | undefined) => money(v, useDict().rules?.wageCurrency || 'JPY')
export const wageCurrencyName = () => currencyName(useDict().rules?.wageCurrency || 'JPY')

/** 课时显示：2 → 2h，1.5 → 1.5h */
export const hours = (v: number | null | undefined) => (v == null ? '' : `${+v.toFixed(2)}h`)

/** 响应式：是否手机宽度（<768px） */
export function useIsMobile() {
  const w = ref(typeof window === 'undefined' ? 1200 : window.innerWidth)
  const onResize = () => (w.value = window.innerWidth)
  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
  return computed(() => w.value < 768)
}

/** 对话框宽度：桌面用给定宽度，手机全屏 */
export function useDialogWidth(desktop = '600px') {
  const mobile = useIsMobile()
  return computed(() => (mobile.value ? '100%' : desktop))
}

/**
 * 下载需要鉴权的文件（如 Excel 导出接口）。
 * downloadFile('/api/attendance/export?classGroupId=1', '出勤表.xlsx')
 */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
  if (!res.ok) throw new Error(`下载失败 ${res.status}`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
