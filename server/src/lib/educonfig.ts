/**
 * 教学配置（后台「成绩与档案设置」）：
 *   examTypes      学员档案里可录入的考试 / 证书类型（等级、总分、分科、可录回数、考试月份）
 *   gradeTemplates 成绩管理里新建考试时可选用的科目模板
 *   profileFields  学员档案字段：显示 / 隐藏、必填、自定义名称
 * 保存在 Setting 'edu'；未保存时使用默认行业模板（日本升学私塾）。
 * 与 RULES 一样，EDU 是可变对象，保存后原地更新，其他模块直接读取即可。
 */
import { z } from 'zod'
import { prisma } from './prisma'
import { badRequest } from './errors'
import { DEFAULT_PRESET, findPreset } from './presets-data'

// ------------------------------------------------------------------
// 类型与校验
// ------------------------------------------------------------------

const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,30}$/, '代码只能包含字母、数字、下划线和短横线（1–30 位）')
const name = z.string().trim().min(1, '请填写名称').max(40, '名称最多 40 个字')

export const subjectSchema = z.object({
  key: code,
  name,
  max: z.coerce.number({ error: '满分必须是数字' }).positive('满分必须大于 0').max(100000),
  /** 及格线（空 = 满分的 60%） */
  pass: z.coerce.number().min(0).nullable().optional(),
  /** 在档案「成绩概览」中显示该科最高分（如 EJU 日语） */
  highlight: z.boolean().optional(),
  hidden: z.boolean().optional(),
})
export type SubjectDef = z.infer<typeof subjectSchema>

/** 总分算法：sum 各科相加；avg 各科平均（按 scoreStep 取整，如雅思 0.5）；manual 手动填写总分 */
export const TOTAL_MODES = ['sum', 'avg', 'manual'] as const
export type TotalMode = (typeof TOTAL_MODES)[number]

const uniqueKeys = (list: { key: string }[]) => new Set(list.map((s) => s.key.toLowerCase())).size === list.length

export const examTypeSchema = z
  .object({
    code,
    name,
    /** 档案中的分组标题（如「语言能力」「升学考试」），同组的简单考试并排显示 */
    group: z.string().trim().max(30).default(''),
    levels: z.array(z.string().trim().min(1).max(20)).max(30).default([]),
    /** 总分满分（无分科时使用；空 = 不限） */
    scoreMax: z.coerce.number().positive().nullable().default(null),
    scoreStep: z.coerce.number().positive().max(100).default(1),
    subjects: z.array(subjectSchema).max(30).default([]),
    totalMode: z.enum(TOTAL_MODES).default('sum'),
    /** 最多可录入几回（1 = 只录一次） */
    maxAttempts: z.coerce.number().int().min(1).max(20).default(1),
    /** 固定考试月份（如 JLPT 7 / 12 月）；为空则按年月自由选择 */
    months: z.array(z.coerce.number().int().min(1).max(12)).max(12).default([]),
    hidden: z.boolean().default(false),
  })
  .refine((e) => uniqueKeys(e.subjects), { message: '同一考试中的科目代码不能重复', path: ['subjects'] })
export type ExamTypeDef = z.infer<typeof examTypeSchema>

export const gradeTemplateSchema = z
  .object({
    id: code,
    name,
    subjects: z.array(subjectSchema).min(1, '至少一个科目').max(30),
    totalMode: z.enum(TOTAL_MODES).default('sum'),
    scoreStep: z.coerce.number().positive().max(100).default(1),
  })
  .refine((e) => uniqueKeys(e.subjects), { message: '同一模板中的科目代码不能重复', path: ['subjects'] })
export type GradeTemplate = z.infer<typeof gradeTemplateSchema>

/** 可配置的学员档案字段（exams / admissions 为整块区域） */
export const PROFILE_FIELDS = [
  'nameAlt', 'gender', 'birthday', 'phone', 'phoneCn', 'wechat', 'qq', 'email', 'address', 'visaStatus',
  'emergency', 'arrivedAt', 'enrollTerm', 'channel', 'organization',
  'education', 'graduatedSchool', 'graduatedMajor', 'graduatedAt', 'languageSchool', 'subjectCategory',
  'targetUniversity', 'targetMajor', 'targetDegree', 'researchTheme',
  'exams', 'admissions',
] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
/** 不支持「必填」的字段（整块区域 / 单选） */
export const NO_REQUIRED: ProfileField[] = ['exams', 'admissions', 'gender']

const fieldConfSchema = z.object({
  hidden: z.boolean().optional(),
  required: z.boolean().optional(),
  label: z.string().trim().max(30).optional(),
})
export type FieldConf = z.infer<typeof fieldConfSchema>

export const eduSchema = z
  .object({
    preset: z.string().trim().max(30).optional(),
    examTypes: z.array(examTypeSchema).max(50),
    gradeTemplates: z.array(gradeTemplateSchema).max(50),
    profileFields: z.partialRecord(z.enum(PROFILE_FIELDS), fieldConfSchema).default({}),
  })
  .refine((c) => new Set(c.examTypes.map((e) => e.code.toUpperCase())).size === c.examTypes.length, {
    message: '考试类型代码不能重复',
    path: ['examTypes'],
  })
  .refine((c) => new Set(c.gradeTemplates.map((e) => e.id.toLowerCase())).size === c.gradeTemplates.length, {
    message: '模板代码不能重复',
    path: ['gradeTemplates'],
  })
export type EduConfig = z.infer<typeof eduSchema>

// ------------------------------------------------------------------
// 当前配置
// ------------------------------------------------------------------

/** 未保存配置时使用默认行业模板 */
export function defaultEdu(): EduConfig {
  return { preset: DEFAULT_PRESET, ...structuredClone(findPreset(DEFAULT_PRESET)!.edu) }
}
const defaults = defaultEdu

export const EDU: EduConfig = defaultEdu()

function apply(saved: unknown) {
  const r = saved ? eduSchema.safeParse(saved) : null
  const next = r?.success ? r.data : defaults()
  EDU.preset = next.preset
  EDU.examTypes = next.examTypes
  EDU.gradeTemplates = next.gradeTemplates
  EDU.profileFields = next.profileFields
}

export async function loadEdu() {
  const row = await prisma.setting.findUnique({ where: { key: 'edu' } })
  let saved: unknown = null
  try {
    saved = row ? JSON.parse(row.value) : null
  } catch {
    saved = null
  }
  apply(saved)
}

/** 正在被学员档案使用的考试类型代码（不可删除，只能隐藏） */
export async function examCodesInUse(): Promise<string[]> {
  const rows = await prisma.studentExam.groupBy({ by: ['examType'] })
  return rows.map((r) => r.examType)
}

export async function saveEdu(body: unknown): Promise<EduConfig> {
  const parsed = eduSchema.safeParse(body)
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    throw badRequest(`参数错误（${i?.path.map(String).join('.')}）：${i?.message ?? ''}`, parsed.error.issues)
  }
  const used = await examCodesInUse()
  const codes = new Set(parsed.data.examTypes.map((e) => e.code))
  const removed = used.filter((c) => !codes.has(c))
  if (removed.length) throw badRequest(`以下考试类型已有学员成绩，不能删除（可设为隐藏）：${removed.join('、')}`)
  await writeEdu(parsed.data)
  return structuredClone(EDU)
}

export async function writeEdu(conf: EduConfig) {
  const value = JSON.stringify(conf)
  await prisma.setting.upsert({ where: { key: 'edu' }, create: { key: 'edu', value }, update: { value } })
  apply(conf)
}

// ------------------------------------------------------------------
// 工具
// ------------------------------------------------------------------

export const findExamType = (c: string) => EDU.examTypes.find((e) => e.code === c)

/** 字段配置（含默认：最终学历、语言学校默认必填） */
export function fieldConf(f: ProfileField): FieldConf {
  return EDU.profileFields[f] ?? {}
}

/** 按总分算法计算总分；没有任何分数时返回 null */
export function computeTotal(subjects: SubjectDef[], scores: Record<string, number>, mode: TotalMode, step = 1): number | null {
  const vals = subjects.map((s) => scores[s.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length || mode === 'manual') return null
  const sum = vals.reduce((a, b) => a + b, 0)
  if (mode === 'sum') return Math.round(sum * 100) / 100
  const avg = sum / vals.length
  return Math.round(avg / step) * step
}

/** 校验并规整分科成绩：只保留配置中的科目，范围 0..满分 */
export function cleanScores(subjects: SubjectDef[], raw: Record<string, unknown> | null | undefined, label: string): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw) return out
  for (const s of subjects) {
    const v = raw[s.key]
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n)) throw badRequest(`${label}「${s.name}」分数无效`)
    if (n < 0 || n > s.max) throw badRequest(`${label}「${s.name}」分数应在 0–${s.max} 之间`)
    out[s.key] = n
  }
  return out
}

export function parseScores(json: string | null | undefined): Record<string, number> {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}
