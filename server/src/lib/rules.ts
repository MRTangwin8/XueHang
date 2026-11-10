/**
 * 后台可配置的业务规则与下拉选项。
 *   Setting 'rules' : Partial<Rules>（只存与默认值不同的项也可以，读取时与默认值合并）
 *   Setting 'dicts' : { [dictKey]: { values: string[]; hidden: string[] } }
 * 启动时 loadSettings()；保存后原地更新 dict.ts 中的 RULES / DICTS / DICT_HIDDEN，其他模块无需改动即可读到新值。
 */
import { z } from 'zod'
import { prisma } from './prisma'
import { badRequest } from './errors'
import { loadEdu } from './educonfig'
import { DEFAULT_RULES, DICT_HIDDEN, DICTS, EDITABLE_DICTS, RULES, type EditableDictKey, type Rules, PORTAL_MODULES } from '../dict'

const HM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式应为 HH:mm')
const int = (min: number, max: number) =>
  z.coerce.number({ error: '请输入数字' }).int('必须是整数').min(min, `不能小于 ${min}`).max(max, `不能大于 ${max}`)

/** 每项规则的校验与取值范围（前端表单同样按此范围限制） */
export const rulesSchema = z
  .object({
    vipAutoConfirmEnabled: z.boolean(),
    vipAutoConfirmHours: int(1, 720),
    vipStudentConfirm: z.boolean(),
    vipRecordRequired: z.boolean(),
    sessionRoomRequired: z.boolean(),
    interviewCancelLockHours: int(0, 168),
    interviewConfirmText: z.string().trim().max(200),
    documentEditHours: int(0, 720),
    documentMaxEdits: int(0, 10),
    documentReturnDays: int(1, 60),
    documentRulesText: z.string().trim().max(3000),
    printPriceBW: int(0, 100000),
    printPriceColor: int(0, 100000),
    printCutoff: HM,
    printReadyTime: HM,
    printGuideText: z.string().trim().max(3000),
    printCurrency: z.string().trim().min(1, '请选择货币').max(12, '货币文字最多 12 个字'),
    wageCurrency: z.string().trim().min(1, '请选择货币').max(12, '货币文字最多 12 个字'),
    maxAdmissions: int(1, 20),
    boardStartHour: int(0, 23),
    boardEndHour: int(1, 24),
    customerRecycleEnabled: z.boolean(),
    customerRecycleDays: int(1, 365),
    studentNoPrefix: z.string().trim().regex(/^[A-Za-z0-9-]{0,10}$/, '前缀只能包含字母、数字和短横线，最多 10 位'),
    orderNoPrefix: z.string().trim().regex(/^[A-Za-z0-9-]{0,10}$/, '前缀只能包含字母、数字和短横线，最多 10 位'),
    uploadMaxMB: int(1, 100),
    loginLockEnabled: z.boolean(),
    loginMaxFailures: int(3, 20),
    loginIpMaxFailures: int(5, 200),
    loginLockMinutes: int(1, 1440),
    sessionDays: int(1, 30),
    readOnlyCanSchedule: z.boolean(),
    portalModules: z.array(z.enum(PORTAL_MODULES)).max(PORTAL_MODULES.length),
    portalGradeShowRank: z.boolean(),
    portalGradeShowAverage: z.boolean(),
    portalGradeShowBest: z.boolean(),
    printFileTypes: z.array(z.enum(['pdf', 'jpg', 'png', 'word', 'excel', 'ppt'])).min(1, '至少选择一种文件格式'),
    timetableExportTitle: z.string().trim().max(60),
    timetableExportFooter: z.string().trim().max(120),
    timetableExportShowTeacher: z.boolean(),
    timetableExportShowRoom: z.boolean(),
  })
  .refine((r) => r.boardEndHour > r.boardStartHour, { message: '看板结束时刻必须晚于开始时刻', path: ['boardEndHour'] })

const dictSchema = z.object({
  values: z.array(z.string().trim().min(1).max(50)).min(1, '至少保留一个选项').max(100),
  hidden: z.array(z.string().trim()).max(100).default([]),
})

async function readJson<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}
async function writeJson(key: string, value: unknown) {
  const v = JSON.stringify(value)
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } })
}

/** 默认下拉选项（首次加载时记录，用于「恢复默认」） */
const DEFAULT_DICTS = Object.fromEntries(EDITABLE_DICTS.map((k) => [k, [...(DICTS[k] as readonly string[])]])) as Record<EditableDictKey, string[]>

function applyRules(saved: Partial<Rules> | null) {
  const merged = { ...structuredClone(DEFAULT_RULES), ...(saved ?? {}) }
  const r = rulesSchema.safeParse(merged)
  Object.assign(RULES, r.success ? r.data : structuredClone(DEFAULT_RULES))
}

function applyDicts(saved: Partial<Record<EditableDictKey, { values: string[]; hidden: string[] }>> | null) {
  for (const k of EDITABLE_DICTS) {
    const arr = DICTS[k] as unknown as string[]
    const conf = saved?.[k]
    arr.length = 0 // 原地修改：其他模块持有的数组引用也能看到新值
    arr.push(...(conf?.values?.length ? conf.values : DEFAULT_DICTS[k]))
    DICT_HIDDEN[k] = conf?.hidden?.filter((v) => arr.includes(v)) ?? []
  }
}

export async function loadSettings() {
  applyRules(await readJson<Partial<Rules>>('rules'))
  applyDicts(await readJson('dicts'))
  await loadEdu()
}

type DictConf = Record<string, { values: string[]; hidden: string[] }>
/** 读取 / 写入全部自定义下拉选项（行业模板导入用） */
export async function readDictConfig(): Promise<DictConf> {
  return (await readJson<DictConf>('dicts')) ?? {}
}
export async function applyDictConfig(all: DictConf) {
  await writeJson('dicts', all)
  applyDicts(all as never)
}

export async function saveRules(patch: unknown): Promise<Rules> {
  const merged = { ...structuredClone(RULES), ...(patch && typeof patch === 'object' ? patch : {}) }
  const r = rulesSchema.safeParse(merged)
  if (!r.success) {
    const first = r.error.issues[0]
    throw badRequest(`参数错误（${first?.path.map(String).join('.')}）：${first?.message ?? ''}`, r.error.issues)
  }
  await writeJson('rules', r.data)
  applyRules(r.data)
  return structuredClone(RULES)
}

export async function resetRules(): Promise<Rules> {
  await prisma.setting.deleteMany({ where: { key: 'rules' } })
  applyRules(null)
  return structuredClone(RULES)
}

/** 当前全部可维护的下拉选项：{ key, values, hidden, defaults } */
export function listEditableDicts() {
  return EDITABLE_DICTS.map((key) => ({
    key,
    values: [...(DICTS[key] as readonly string[])],
    hidden: [...(DICT_HIDDEN[key] ?? [])],
    defaults: DEFAULT_DICTS[key],
  }))
}

export async function saveDict(key: string, body: unknown) {
  if (!(EDITABLE_DICTS as readonly string[]).includes(key)) throw badRequest('该选项不可修改')
  const k = key as EditableDictKey
  const parsed = dictSchema.safeParse(body)
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? '参数错误')
  const values = [...new Set(parsed.data.values)]
  const hidden = [...new Set(parsed.data.hidden)].filter((v) => values.includes(v))
  if (hidden.length >= values.length) throw badRequest('至少保留一个可见选项')
  // 已有选项不允许删除（历史数据仍在使用），只能隐藏
  const removed = (DICTS[k] as readonly string[]).filter((v) => !values.includes(v))
  if (removed.length) throw badRequest(`已有选项不能删除，只能隐藏：${removed.join('、')}`)
  const all = (await readJson<Record<string, unknown>>('dicts')) ?? {}
  all[k] = { values, hidden }
  await writeJson('dicts', all)
  applyDicts(all as never)
}

export async function resetDict(key: string) {
  if (!(EDITABLE_DICTS as readonly string[]).includes(key)) throw badRequest('该选项不可修改')
  const all = (await readJson<Record<string, unknown>>('dicts')) ?? {}
  delete all[key]
  // 恢复默认时，保留曾新增过的选项为隐藏状态，避免历史数据变成非法值
  const k = key as EditableDictKey
  const extra = (DICTS[k] as readonly string[]).filter((v) => !DEFAULT_DICTS[k].includes(v))
  if (extra.length) all[key] = { values: [...DEFAULT_DICTS[k], ...extra], hidden: extra }
  await writeJson('dicts', all)
  applyDicts(all as never)
}
