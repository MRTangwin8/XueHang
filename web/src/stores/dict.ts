import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/http'
import { i18n } from '@/i18n'
import type { EduConfig } from '@/utils/edu'

/**
 * 字典标签翻译：src/i18n/dicts/<locale>.ts 默认导出 { [dictKey]: { [value]: label } }。
 * 中文不需要文件（直接用服务端返回的标签）。
 */
const dictFiles = import.meta.glob<{ default: Record<string, Record<string, string>> }>('../i18n/dicts/*.ts', { eager: true })
const DICT_I18N: Record<string, Record<string, Record<string, string>>> = Object.fromEntries(
  Object.entries(dictFiles).map(([p, m]) => [p.split('/').pop()!.replace(/\.ts$/, ''), m.default]),
)

export interface DictOption {
  value: string
  label: string
  color?: string
}

/** 业务规则常量（与 server/src/dict.ts RULES 一致） */
export interface Rules {
  vipAutoConfirmEnabled: boolean
  vipAutoConfirmHours: number
  vipStudentConfirm: boolean
  vipRecordRequired: boolean
  sessionRoomRequired: boolean
  interviewCancelLockHours: number
  /** 自定义预约确认提示，空 = 默认文案 */
  interviewConfirmText: string
  documentEditHours: number
  documentMaxEdits: number
  documentReturnDays: number
  /** 自定义文书规则说明，空 = 默认说明 */
  documentRulesText: string
  printPriceBW: number
  printPriceColor: number
  printCutoff: string
  printReadyTime: string
  /** 自定义打印说明，空 = 默认说明 */
  printGuideText: string
  /** 打印费 / 工资的货币：JPY / CNY / 自定义文字 */
  printCurrency: string
  wageCurrency: string
  /** 只读（演示）账号可以排课 */
  readOnlyCanSchedule: boolean
  maxAdmissions: number
  boardStartHour: number
  boardEndHour: number
  loginLockEnabled: boolean
  /** 学生端开放的功能：timetable / grades / vip / interviews / documents / prints */
  portalModules: string[]
  portalGradeShowRank: boolean
  portalGradeShowAverage: boolean
  portalGradeShowBest: boolean
  /** 资料打印可上传的文件类型：pdf / jpg / png / word / excel / ppt */
  printFileTypes: string[]
  timetableExportTitle: string
  timetableExportFooter: string
  timetableExportShowTeacher: boolean
  timetableExportShowRoom: boolean
  loginMaxFailures: number
  loginIpMaxFailures: number
  loginLockMinutes: number
  sessionDays: number
}


/**
 * 字典：启动时加载一次。用法：
 *   const dict = useDict()
 *   dict.options('educations')        // DictOption[]
 *   dict.label('orderStatuses', 'PAID') // '已缴清'
 */
export const useDict = defineStore('dict', () => {
  const raw = ref<Record<string, (string | DictOption)[]>>({})
  const rules = ref<Rules | null>(null)
  /** 考试类型 / 成绩模板 / 档案字段（成绩与档案设置） */
  const edu = ref<EduConfig | null>(null)
  /** 已隐藏的选项：历史数据仍按标签显示，但新表单不再提供 */
  const hidden = ref<Record<string, string[]>>({})
  const loaded = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    const r = await api.get<{ dicts: Record<string, (string | DictOption)[]>; hidden?: Record<string, string[]>; rules: Rules; edu: EduConfig }>(
      '/common/dicts',
    )
    raw.value = r.dicts
    hidden.value = r.hidden ?? {}
    rules.value = r.rules
    edu.value = r.edu
    loaded.value = true
  }

  /** 字典标签按当前语言翻译（src/i18n/dicts/<locale>.ts）；没有译文时用服务端的中文标签 */
  function translate(key: string, value: string, fallback: string): string {
    const loc = i18n.global.locale.value as string
    return DICT_I18N[loc]?.[key]?.[value] ?? fallback
  }

  /** 全部选项（含已隐藏），用于显示标签 */
  function allOptions(key: string): DictOption[] {
    return (raw.value[key] ?? []).map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o
      return { ...opt, label: translate(key, opt.value, opt.label) }
    })
  }

  /** 可选择的选项（不含已隐藏；keep 指定的值即使已隐藏也保留，便于编辑旧数据） */
  function options(key: string, keep?: string | string[] | null): DictOption[] {
    const h = hidden.value[key] ?? []
    const keepList = keep == null ? [] : Array.isArray(keep) ? keep : [keep]
    return allOptions(key).filter((o) => !h.includes(o.value) || keepList.includes(o.value))
  }

  function find(key: string, value: string | null | undefined): DictOption | undefined {
    if (value == null) return undefined
    return allOptions(key).find((o) => o.value === value)
  }

  function label(key: string, value: string | null | undefined): string {
    if (value == null || value === '') return ''
    return find(key, value)?.label ?? value
  }

  /** 翻译任意字典值（不要求该值在当前选项中，如行业模板预览） */
  const tr = (key: string, value: string) => translate(key, value, value)

  return { raw, rules, edu, hidden, loaded, load, options, allOptions, find, label, tr }
})
