import { currentLocale, t } from '@/i18n'
import { api, type Paged } from '@/api/http'
import { toApi, fmtDate } from '@/utils/time'

export interface UserLite { id: number; name: string }

export interface StudentRow {
  id: number
  studentNo: string
  name: string
  nameAlt: string | null
  gender: string | null
  phone: string | null
  wechat: string | null
  status: string
  campusId: number
  campus: { id: number; name: string }
  education: string
  languageSchool: string
  subjectCategory: string | null
  targetUniversity: string | null
  enrollTerm: string | null
  enrolledAt: string
  deletedAt: string | null
  sales: UserLite | null
  mainTeacher: UserLite | null
  contractTeacher: UserLite | null
  packageName: string | null
  packageId: number | null
  classMode: string | null
  /** 仅「我销售的 / 全部」且有订单权限时返回 */
  latestOrder?: { id: number; currency: string; payableAmount: number; paidAmount: number; refundedAmount: number; status: string }
}

export interface Exam {
  id?: number
  examType: string
  examDate: string | null
  attempt: number | null
  level: string | null
  score: number | null
  /** 分科成绩 { 科目key: 分数 } */
  scores: Record<string, number> | null
  note: string | null
}

export interface Admission {
  id?: number
  university: string
  faculty: string | null
  department: string | null
  major: string | null
  admittedAt?: string | null
  note?: string | null
}

export interface StudentDetail {
  id: number
  studentNo: string
  name: string
  nameAlt: string | null
  gender: string | null
  birthday: string | null
  phone: string | null
  phoneCn: string | null
  wechat: string | null
  qq: string | null
  email: string | null
  address: string | null
  emergencyName: string | null
  emergencyRelation: string | null
  emergencyPhone: string | null
  visaStatus: string | null
  arrivedAt: string | null
  enrollTerm: string | null
  status: string
  enrolledAt: string
  leftAt: string | null
  campusId: number
  campus: { id: number; name: string }
  channelId: number | null
  channel: { id: number; name: string } | null
  organizationId: number | null
  organization: { id: number; name: string } | null
  customer: { id: number; name: string } | null
  education: string
  graduatedSchool: string | null
  graduatedMajor: string | null
  graduatedAt: string | null
  languageSchool: string
  subjectCategory: string | null
  targetUniversity: string | null
  targetMajor: string | null
  targetDegree: string | null
  researchTheme: string | null
  salesId: number | null
  sales: UserLite | null
  mainTeacherId: number | null
  mainTeacher: UserLite | null
  contractTeacherId: number | null
  contractTeacher: UserLite | null
  note: string | null
  deletedAt: string | null
  hasPortalPassword: boolean
  exams: Exam[]
  admissions: Admission[]
  packageName: string | null
  classMode: string | null
  classGroups: { id: number; name: string; subject: string | null; status: string; startDate: string | null; endDate: string | null; teacher:
    UserLite | null; joinedAt: string }[]
  vipPackages: {
    id: number; name: string; subject: string | null; totalHours: number; usedHours: number; pendingHours: number; status: string; expireAt: string |
      null; orderId: number | null
    teachers: { teacher: UserLite }[]
  }[]
  vipSummary: { total: number; used: number; pending: number; remaining: number }
  orders?: {
    id: number; orderNo: string; classMode: string; vipHours: number | null; vipContent: string | null; currency: string; listAmount: number;
      discountAmount: number
    payableAmount: number; paidAmount: number; refundedAmount: number; status: string; signedAt: string; expireAt: string | null
    package: { id: number; name: string } | null; sales: UserLite | null
  }[]
  access: { canView: boolean; bySales: boolean; byTeacher: boolean; byAll: boolean; canEdit: boolean; canViewOrders: boolean; canManage: boolean;
    canDelete: boolean }
}

// ------------------------------------------------------------------
// 档案表单模型（StudentForm 使用）
// ------------------------------------------------------------------

/** 'YYYY-MM-DD' → '2026年6月' */
export function examSessionLabel(d: string | null | undefined): string {
  if (!d) return ''
  const locale = currentLocale()
  const month = Number(d.slice(5, 7))
  const formattedMonth = locale === 'zh-CN' || locale === 'ja'
    ? month
    : new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : locale, { month: 'short', timeZone: 'Asia/Tokyo' })
      .format(new Date(Date.UTC(Number(d.slice(0, 4)), month - 1, 1)))
  return t('students.messages.examSessionDate', { p1: d.slice(0, 4), p2: formattedMonth })
}

/** 一条考试成绩（表单） */
export interface ExamEntry {
  examDate: string | null
  level: string | null
  score: number | null
  scores: Record<string, number | null>
  note: string | null
}
export const emptyExamEntry = (): ExamEntry => ({ examDate: null, level: null, score: null, scores: {}, note: null })

export interface StudentFormModel {
  name: string
  nameAlt: string
  gender: string | null
  birthday: string | null
  phone: string
  phoneCn: string
  wechat: string
  qq: string
  email: string
  address: string
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  visaStatus: string | null
  arrivedAt: string | null
  enrollTerm: string
  campusId: number | null
  channelId: number | null
  organizationId: number | null
  education: string | null
  graduatedSchool: string
  graduatedMajor: string
  graduatedAt: string | null
  languageSchool: string
  subjectCategory: string | null
  targetUniversity: string
  targetMajor: string
  targetDegree: string | null
  researchTheme: string
  salesId: number | null
  mainTeacherId: number | null
  contractTeacherId: number | null
  note: string
  /** 考试类型代码 → 各回成绩（按回数顺序） */
  exams: Record<string, ExamEntry[]>
  admissions: Admission[]
}

export const emptyAdmission = (): Admission => ({ university: '', faculty: null, department: null, major: null })

export function emptyStudentForm(): StudentFormModel {
  return {
    name: '', nameAlt: '', gender: null, birthday: null, phone: '', phoneCn: '', wechat: '', qq: '', email: '', address: '',
    emergencyName: '', emergencyRelation: '', emergencyPhone: '', visaStatus: null, arrivedAt: null, enrollTerm: '',
    campusId: null, channelId: null, organizationId: null,
    education: null, graduatedSchool: '', graduatedMajor: '', graduatedAt: null, languageSchool: '', subjectCategory: null,
    targetUniversity: '', targetMajor: '', targetDegree: null, researchTheme: '',
    salesId: null, mainTeacherId: null, contractTeacherId: null, note: '',
    exams: {},
    admissions: [],
  }
}

const d = (v: string | null | undefined) => (v ? fmtDate(v) : null)
const iso = (v: string | null | undefined) => (v ? toApi(v) : null)
const s = (v: string | null | undefined) => v ?? ''

export function studentFormFromDetail(x: StudentDetail): StudentFormModel {
  const f = emptyStudentForm()
  Object.assign(f, {
    name: x.name, nameAlt: s(x.nameAlt), gender: x.gender, birthday: d(x.birthday), phone: s(x.phone), phoneCn: s(x.phoneCn), wechat: s(x.wechat),
    qq: s(x.qq), email: s(x.email), address: s(x.address), emergencyName: s(x.emergencyName), emergencyRelation: s(x.emergencyRelation),
    emergencyPhone: s(x.emergencyPhone), visaStatus: x.visaStatus, arrivedAt: d(x.arrivedAt), enrollTerm: s(x.enrollTerm),
    campusId: x.campusId, channelId: x.channelId, organizationId: x.organizationId,
    education: x.education, graduatedSchool: s(x.graduatedSchool), graduatedMajor: s(x.graduatedMajor), graduatedAt: d(x.graduatedAt),
    languageSchool: x.languageSchool, subjectCategory: x.subjectCategory, targetUniversity: s(x.targetUniversity), targetMajor: s(x.targetMajor),
    targetDegree: x.targetDegree, researchTheme: s(x.researchTheme), salesId: x.salesId, mainTeacherId: x.mainTeacherId,
    contractTeacherId: x.contractTeacherId, note: s(x.note),
  })
  for (const e of [...x.exams].sort((p, q) => (p.attempt ?? 0) - (q.attempt ?? 0) || (p.id ?? 0) - (q.id ?? 0))) {
    const list = (f.exams[e.examType] ??= [])
    list.push({ examDate: d(e.examDate), level: e.level, score: e.score, scores: { ...(e.scores ?? {}) }, note: e.note })
  }
  f.admissions = x.admissions.map((a) => ({ university: a.university, faculty: a.faculty, department: a.department, major: a.major, admittedAt:
    a.admittedAt, note: a.note }))
  return f
}

/** 是否填写了任何内容 */
export const examFilled = (e: ExamEntry) =>
  !!(e.level || e.score != null || e.examDate || Object.values(e.scores).some((v) => v != null && (v as unknown) !== ''))

/** 表单 → 接口 payload */
export function studentPayload(f: StudentFormModel) {
  const { exams: examMap, admissions, birthday, arrivedAt, graduatedAt, ...rest } = f
  const exams: Partial<Exam>[] = []
  for (const [examType, list] of Object.entries(examMap)) {
    const filled = list.filter(examFilled)
    const multi = filled.length > 1 || list.length > 1
    filled.forEach((e, i) => {
      const scores = Object.fromEntries(Object.entries(e.scores).filter(([, v]) => v != null && (v as unknown) !== '')) as Record<string, number>
      exams.push({ examType, attempt: multi ? i + 1 : null, examDate: iso(e.examDate), level: e.level || null, score: e.score, scores, note: e.note })
    })
  }
  return {
    ...rest,
    birthday: iso(birthday),
    arrivedAt: iso(arrivedAt),
    graduatedAt: iso(graduatedAt),
    exams,
    admissions: admissions.map((a) => ({ university: a.university.trim(), faculty: a.faculty || null, department: a.department || null, major:
      a.major || null, admittedAt: a.admittedAt ?? null, note: a.note ?? null })),
  }
}

export const studentsApi = {
  list: (params: Record<string, unknown>) => api.get<Paged<StudentRow> & { scope: string }>('/students', params),
  get: (id: number) => api.get<StudentDetail>(`/students/${id}`),
  create: (body: unknown) => api.post<{ id: number; studentNo: string; initialPassword: string }>('/students', body),
  update: (id: number, body: unknown) => api.put(`/students/${id}`, body),
  setStatus: (id: number, status: string, leftAt?: string | null) => api.post(`/students/${id}/status`, { status, leftAt }),
  resetPassword: (id: number) => api.post<{ studentNo: string; password: string }>(`/students/${id}/reset-portal-password`),
  remove: (id: number) => api.delete(`/students/${id}`),
  restore: (id: number) => api.post(`/students/${id}/restore`),
  universities: (q: string) => api.get<string[]>('/students/universities', { q }),
}
