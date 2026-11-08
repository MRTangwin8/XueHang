/**
 * 教学配置（成绩与档案设置）的前端类型与工具：
 * 考试类型、成绩模板、档案字段的显示名称 / 显示与必填。
 */
import { currentLocale, t } from '@/i18n'
import { useDict } from '@/stores/dict'

export type TotalMode = 'sum' | 'avg' | 'manual'

export interface SubjectDef {
  key: string
  name: string
  max: number
  pass?: number | null
  highlight?: boolean
  hidden?: boolean
}

export interface ExamTypeDef {
  code: string
  name: string
  group: string
  levels: string[]
  scoreMax: number | null
  scoreStep: number
  subjects: SubjectDef[]
  totalMode: TotalMode
  maxAttempts: number
  months: number[]
  hidden: boolean
}

export interface GradeTemplate {
  id: string
  name: string
  subjects: SubjectDef[]
  totalMode: TotalMode
  scoreStep: number
}

export interface FieldConf {
  hidden?: boolean
  required?: boolean
  label?: string
}

export const PROFILE_FIELDS = [
  'nameAlt', 'gender', 'birthday', 'phone', 'phoneCn', 'wechat', 'qq', 'email', 'address', 'visaStatus',
  'emergency', 'arrivedAt', 'enrollTerm', 'channel', 'organization',
  'education', 'graduatedSchool', 'graduatedMajor', 'graduatedAt', 'languageSchool', 'subjectCategory',
  'targetUniversity', 'targetMajor', 'targetDegree', 'researchTheme',
  'exams', 'admissions',
] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export const NO_REQUIRED: ProfileField[] = ['exams', 'admissions', 'gender']

export interface EduConfig {
  preset?: string
  examTypes: ExamTypeDef[]
  gradeTemplates: GradeTemplate[]
  profileFields: Partial<Record<ProfileField, FieldConf>>
}

/** 字段默认名称（i18n key） */
export const FIELD_LABEL_KEYS: Record<ProfileField, string> = {
  nameAlt: 'students.messages.romanizedJapaneseName',
  gender: 'students.messages.gender',
  birthday: 'students.messages.dateOfBirth',
  phone: 'students.messages.phone',
  phoneCn: 'students.messages.phoneInChina',
  wechat: 'students.messages.wechat',
  qq: 'grades.field.qq',
  email: 'students.messages.email',
  address: 'students.messages.address',
  visaStatus: 'students.messages.visa',
  emergency: 'students.messages.emergencyContact',
  arrivedAt: 'students.messages.arrivalInJapan',
  enrollTerm: 'students.messages.enrollmentTerm',
  channel: 'students.messages.source',
  organization: 'students.messages.partnerOrganization',
  education: 'students.messages.highestQualification',
  graduatedSchool: 'students.messages.graduatedInstitution',
  graduatedMajor: 'students.messages.graduatedMajor',
  graduatedAt: 'students.messages.graduationDate',
  languageSchool: 'students.messages.languageSchool',
  subjectCategory: 'students.messages.subjectCategory',
  targetUniversity: 'students.messages.targetInstitution',
  targetMajor: 'students.messages.targetMajor',
  targetDegree: 'students.messages.targetDegree',
  researchTheme: 'students.messages.researchTopic',
  exams: 'grades.field.exams',
  admissions: 'students.messages.admissions',
}

// ------------------------------------------------------------------
// 行业模板中内置名称的翻译（src/i18n/names/<locale>.ts：{ 中文名: 译名 }）
// 用户自定义的名称原样显示
// ------------------------------------------------------------------
const nameFiles = import.meta.glob<{ default: Record<string, string> }>('../i18n/names/*.ts', { eager: true })
const NAMES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(nameFiles).map(([p, m]) => [p.split('/').pop()!.replace(/\.ts$/, ''), m.default]),
)

export function localName(s: string | null | undefined): string {
  if (!s) return ''
  return NAMES[currentLocale()]?.[s] ?? s
}

export function useEdu() {
  const dict = useDict()
  const conf = (): EduConfig => dict.edu ?? { examTypes: [], gradeTemplates: [], profileFields: {} }
  const field = (f: ProfileField): FieldConf => conf().profileFields[f] ?? {}
  return {
    conf,
    examTypes: (includeHidden = false) => conf().examTypes.filter((e) => includeHidden || !e.hidden),
    examType: (code: string) => conf().examTypes.find((e) => e.code === code),
    templates: () => conf().gradeTemplates,
    show: (f: ProfileField) => !field(f).hidden,
    required: (f: ProfileField) => !field(f).hidden && !!field(f).required && !NO_REQUIRED.includes(f),
    label: (f: ProfileField) => (field(f).label ? localName(field(f).label) : t(FIELD_LABEL_KEYS[f])),
  }
}

/** 与服务端一致的总分算法 */
export function computeTotal(subjects: SubjectDef[], scores: Record<string, number | null | undefined>, mode: TotalMode, step = 1): number | null {
  const vals = subjects.map((s) => scores[s.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length || mode === 'manual') return null
  const sum = vals.reduce((a, b) => a + b, 0)
  if (mode === 'sum') return Math.round(sum * 100) / 100
  return Math.round(sum / vals.length / step) * step
}

/** 满分：sum 为各科之和，avg 为单科满分 */
export function fullMark(subjects: SubjectDef[], mode: TotalMode, scoreMax?: number | null): number | null {
  if (scoreMax) return scoreMax
  if (!subjects.length) return null
  return mode === 'avg' ? Math.max(...subjects.map((s) => s.max)) : subjects.reduce((a, s) => a + s.max, 0)
}

export const passLine = (s: SubjectDef) => (s.pass ?? null) != null ? Number(s.pass) : Math.round(s.max * 0.6 * 100) / 100
