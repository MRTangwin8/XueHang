import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma, type Tx } from '../../lib/prisma'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { zOptStr } from '../../lib/http'
import { dayjs, DEFAULT_TZ } from '../../lib/time'
import { DICTS, RULES } from '../../dict'
import { NO_REQUIRED, PROFILE_FIELDS, cleanScores, computeTotal, fieldConf, findExamType, type ProfileField } from '../../lib/educonfig'
import { hasPerm, scopeWhere, type StaffPrincipal } from '../../plugins/auth'

// ------------------------------------------------------------------
// 校验 schema
// ------------------------------------------------------------------

const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional())
const optNum = z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nullable().optional())
const optId = z.preprocess((v) => (v === '' || v === 0 ? null : v), z.coerce.number().int().positive().nullable().optional())

export const examSchema = z.object({
  examType: z.string({ error: '考试类型无效' }).trim().min(1, '考试类型无效').max(30),
  examDate: optDate,
  attempt: optNum,
  level: zOptStr,
  score: optNum,
  /** 分科成绩 { 科目key: 分数 } */
  scores: z.record(z.string(), z.unknown()).nullable().optional(),
  note: zOptStr,
})

export const admissionSchema = z.object({
  university: z.string({ error: '合格院校必填' }).trim().min(1, '合格院校必填'),
  faculty: zOptStr,
  department: zOptStr,
  major: zOptStr,
  admittedAt: optDate,
  note: zOptStr,
})

export const studentSchema = z.object({
  name: z.string({ error: '请填写姓名' }).trim().min(1, '请填写姓名'),
  nameAlt: zOptStr,
  gender: z.preprocess((v) => (v === '' ? null : v), z.enum(['M', 'F']).nullable().optional()),
  birthday: optDate,
  phone: zOptStr,
  phoneCn: zOptStr,
  wechat: zOptStr,
  qq: zOptStr,
  email: zOptStr,
  address: zOptStr,
  emergencyName: zOptStr,
  emergencyRelation: zOptStr,
  emergencyPhone: zOptStr,
  visaStatus: zOptStr,
  arrivedAt: optDate,
  enrollTerm: zOptStr,
  campusId: z.coerce.number({ error: '请选择校区' }).int().positive('请选择校区'),
  channelId: optId,
  organizationId: optId,

  education: zOptStr,
  graduatedSchool: zOptStr,
  graduatedMajor: zOptStr,
  graduatedAt: optDate,
  languageSchool: zOptStr,
  subjectCategory: zOptStr,
  targetUniversity: zOptStr,
  targetMajor: zOptStr,
  targetDegree: zOptStr,
  researchTheme: zOptStr,

  salesId: optId,
  mainTeacherId: optId,
  contractTeacherId: optId,
  note: zOptStr,

  exams: z.array(examSchema).default([]),
  admissions: z.array(admissionSchema).default([]),
})

export type StudentInput = z.infer<typeof studentSchema>

// ------------------------------------------------------------------
// 业务校验
// ------------------------------------------------------------------

/** 校验字典值、老师身份、成绩与合格信息条数，返回规整后的成绩 / 合格数据 */
/** 档案字段 → 表单字段（用于必填校验） */
const FIELD_PROPS: Partial<Record<ProfileField, keyof StudentInput>> = {
  channel: 'channelId',
  organization: 'organizationId',
  emergency: 'emergencyName',
}
/** 必填校验的默认中文名（自定义名称优先） */
const FIELD_NAMES: Partial<Record<ProfileField, string>> = {
  education: '最终学历', languageSchool: '语言学校', subjectCategory: '学科分类', phone: '电话', email: '邮箱', birthday: '出生日期',
}

/** 校验字典值、老师身份、成绩与合格信息条数，返回规整后的成绩 / 合格数据 */
export async function validateStudentInput(input: StudentInput) {
  for (const f of PROFILE_FIELDS) {
    if (NO_REQUIRED.includes(f)) continue
    const c = fieldConf(f)
    if (!c.required || c.hidden) continue
    const prop = FIELD_PROPS[f] ?? (f as keyof StudentInput)
    const v = input[prop]
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) throw badRequest(`${c.label || FIELD_NAMES[f] || f}为必填项`)
  }
  if (input.education && !(DICTS.educations as readonly string[]).includes(input.education)) throw badRequest('最终学历不在可选范围内')
  if (input.subjectCategory && !(DICTS.subjectCategories as readonly string[]).includes(input.subjectCategory))
    throw badRequest('学科分类不在可选范围内')
  if (input.targetDegree && !(DICTS.targetDegrees as readonly string[]).includes(input.targetDegree)) throw badRequest('志望学位不在可选范围内')

  const campus = await prisma.campus.findFirst({ where: { id: input.campusId, deletedAt: null } })
  if (!campus) throw badRequest('校区不存在')

  // 担当 / 签约老师：必须是教师身份且未删除的工号
  for (const [field, label] of [['mainTeacherId', '担当老师'], ['contractTeacherId', '签约老师']] as const) {
    const id = input[field]
    if (!id) continue
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null, identity: 'TEACHER' } })
    if (!u) throw badRequest(`${label}：只能选择教师身份的工号`)
  }
  if (input.salesId) {
    const u = await prisma.user.findFirst({ where: { id: input.salesId, deletedAt: null } })
    if (!u) throw badRequest('销售顾问工号不存在')
  }

  // 成绩：按「成绩与档案设置」中的考试类型校验
  const byType = new Map<string, typeof input.exams>()
  for (const e of input.exams) {
    if (!findExamType(e.examType)) throw badRequest(`考试类型「${e.examType}」不存在，请先在「成绩与档案设置」中添加`)
    byType.set(e.examType, [...(byType.get(e.examType) ?? []), e])
  }
  const exams: Prisma.StudentExamCreateManyInput[] = []
  for (const [code, list] of byType) {
    const def = findExamType(code)!
    if (list.length > def.maxAttempts) throw badRequest(`${def.name} 最多录入 ${def.maxAttempts} 回`)
    const used = new Set<number>()
    for (const e of list)
      if (e.attempt != null) {
        if (!Number.isInteger(e.attempt) || e.attempt < 1 || e.attempt > def.maxAttempts) throw badRequest(`${def.name} 回数只能是 1~${def.maxAttempts}`)
        if (used.has(e.attempt)) throw badRequest(`${def.name} 第 ${e.attempt} 回重复`)
        used.add(e.attempt)
      }
    let next = 1
    for (const e of list) {
      if (e.level && def.levels.length && !def.levels.includes(e.level)) throw badRequest(`${def.name} 的等级「${e.level}」不在可选范围内`)
      const scores = cleanScores(def.subjects, e.scores as Record<string, unknown> | null, def.name)
      let score = e.score ?? null
      if (def.subjects.length && def.totalMode !== 'manual') score = computeTotal(def.subjects, scores, def.totalMode, def.scoreStep) ?? score
      if (score != null && (score < 0 || (def.scoreMax != null && score > def.scoreMax))) throw badRequest(`${def.name} 总分应在 0–${def.scoreMax} 之间`)
      let attempt = e.attempt ?? null
      if (def.maxAttempts > 1 && attempt == null) {
        while (used.has(next)) next++
        attempt = next
        used.add(next)
      }
      exams.push({
        studentId: 0,
        examType: code,
        examDate: e.examDate ?? null,
        attempt,
        level: def.levels.length ? (e.level ?? null) : null,
        score,
        scores: Object.keys(scores).length ? JSON.stringify(scores) : null,
        note: e.note ?? null,
      })
    }
  }

  if (input.admissions.length > RULES.maxAdmissions) throw badRequest(`合格信息最多 ${RULES.maxAdmissions} 条`)
  const admissions = input.admissions.map((a, i) => ({
    studentId: 0,
    sort: i + 1,
    university: a.university,
    faculty: a.faculty ?? null,
    department: a.department ?? null,
    major: a.major ?? null,
    admittedAt: a.admittedAt ?? null,
    note: a.note ?? null,
  }))
  return { exams, admissions }
}

/** 档案字段（不含 exams / admissions） */
export function profileData(input: StudentInput) {
  const { exams: _e, admissions: _a, ...rest } = input
  return rest
}

export async function replaceExamsAndAdmissions(
  tx: Tx,
  studentId: number,
  exams: Prisma.StudentExamCreateManyInput[],
  admissions: Prisma.StudentAdmissionCreateManyInput[],
) {
  await tx.studentExam.deleteMany({ where: { studentId } })
  await tx.studentAdmission.deleteMany({ where: { studentId } })
  if (exams.length) await tx.studentExam.createMany({ data: exams.map((e) => ({ ...e, studentId })) })
  if (admissions.length) await tx.studentAdmission.createMany({ data: admissions.map((a) => ({ ...a, studentId })) })
}

// ------------------------------------------------------------------
// 学号 / 密码
// ------------------------------------------------------------------

/** 学号 S{YYYY}{3位序号}，按年递增，避开已存在的（含已删除） */
export async function nextStudentNo(tx: Tx | typeof prisma = prisma): Promise<string> {
  const prefix = `${RULES.studentNoPrefix}${dayjs().tz(DEFAULT_TZ).format('YYYY')}`
  const rows = await tx.student.findMany({ where: { studentNo: { startsWith: prefix } }, select: { studentNo: true } })
  let max = 0
  for (const r of rows) {
    const n = Number(r.studentNo.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/** 学生端初始密码统一由 lib/password.generatePassword 生成（10 位随机） */

// ------------------------------------------------------------------
// 可见性
// ------------------------------------------------------------------

export interface Access {
  canView: boolean
  bySales: boolean
  byTeacher: boolean
  byAll: boolean
}

type StudentLite = { id: number; campusId: number; salesId: number | null; mainTeacherId: number | null; contractTeacherId: number | null }

/** 判断教职工对某学员的可见性（sales / teacher / all 任一） */
export function studentAccess(me: StaffPrincipal, s: StudentLite): Access {
  const bySales = hasPerm(me, 'student.view') && s.salesId === me.id
  const byTeacher = hasPerm(me, 'teacher.students') && (s.mainTeacherId === me.id || s.contractTeacherId === me.id)
  let byAll = false
  if (hasPerm(me, 'student.all')) {
    const w = scopeWhere(me) as { campusId?: number }
    byAll = w.campusId == null || w.campusId === s.campusId
  }
  return { canView: bySales || byTeacher || byAll, bySales, byTeacher, byAll }
}

/** 能否编辑档案：student.edit 且可见，或本人为该生销售 */
export function canEditStudent(me: StaffPrincipal, s: StudentLite) {
  const a = studentAccess(me, s)
  return (hasPerm(me, 'student.edit') && a.canView) || s.salesId === me.id
}

export async function loadStudentOr404(id: number, includeDeleted = false) {
  const s = await prisma.student.findFirst({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) } })
  if (!s) throw notFound('学员不存在')
  return s
}

export function assertCanView(me: StaffPrincipal, s: StudentLite) {
  if (!studentAccess(me, s).canView) throw forbidden('无权查看该学员')
}

// ------------------------------------------------------------------
// 院校搜索：简体中文 / 旧字体 → 日文新字体的常用字映射，使「东京」「早稻田」「庆应」也能搜到
// ------------------------------------------------------------------
const CHAR_MAP: Record<string, string> = Object.fromEntries(
  (
    '东東 稻稲 庆慶 应應 义義 桥橋 业業 艺芸 藝芸 术術 际際 关関 馆館 滨浜 广広 岛島 冈岡 泽沢 澤沢 泻潟 农農 电電 气気 爱愛 纤繊 维維 ' +
    '习習 驹駒 专専 藏蔵 乐楽 园園 亚亜 叶葉 语語 户戸 國国 學学 门門 阳陽 静静 长長 乡郷 览覧 讯訊 识識 带帯 庐廬 湾湾 绘絵 画画'
  )
    .split(' ')
    .filter(Boolean)
    .map((p) => [p[0], p[1]]),
)
export const normalizeUni = (s: string) => [...s.toLowerCase()].map((c) => CHAR_MAP[c] ?? c).join('').replace(/\s+/g, '')

// ------------------------------------------------------------------
// 常见日本大学（合格院校搜索建议，日文写法）
// ------------------------------------------------------------------
export const UNIVERSITIES = [
  '東京大学', '京都大学', '一橋大学', '東京工業大学', '東京科学大学', '大阪大学', '名古屋大学', '東北大学', '九州大学', '北海道大学',
  '筑波大学', '神戸大学', '横浜国立大学', '東京外国語大学', '東京芸術大学', 'お茶の水女子大学', '千葉大学', '埼玉大学', '広島大学', '岡山大学',
  '金沢大学', '新潟大学', '東京学芸大学', '東京農工大学', '電気通信大学', '東京都立大学', '大阪公立大学', '横浜市立大学', '名古屋市立大学', '京都工芸繊維大学',
  '早稲田大学', '慶應義塾大学', '上智大学', '明治大学', '立教大学', '中央大学', '法政大学', '青山学院大学', '学習院大学', '東京理科大学',
  '同志社大学', '立命館大学', '関西学院大学', '関西大学', '日本大学', '東洋大学', '駒澤大学', '専修大学', '國學院大學', '成蹊大学',
  '成城大学', '明治学院大学', '武蔵大学', '国際基督教大学', '津田塾大学', '芝浦工業大学', '東京都市大学', '立命館アジア太平洋大学', '南山大学', '近畿大学',
  '武蔵野美術大学', '多摩美術大学', '女子美術大学', '東京造形大学', '日本大学芸術学部', '京都市立芸術大学', '京都精華大学', '金沢美術工芸大学', '東京音楽大学', '国立音楽大学',
  '武蔵野音楽大学', '桐朋学園大学', '昭和音楽大学', '洗足学園音楽大学',
]
