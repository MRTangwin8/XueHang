import type { Prisma } from '../../generated/prisma/client'
import { forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { parseScores, type SubjectDef, type TotalMode } from '../../lib/educonfig'
import { hasPerm, type StaffPrincipal } from '../../plugins/auth'

export interface AssessmentSubjects {
  subjects: SubjectDef[]
  totalMode: TotalMode
  scoreStep: number
}

/** Assessment.subjects 存储格式：{ subjects, totalMode, scoreStep } */
export function readSubjects(json: string): AssessmentSubjects {
  try {
    const v = JSON.parse(json)
    if (Array.isArray(v)) return { subjects: v, totalMode: 'sum', scoreStep: 1 }
    return { subjects: v.subjects ?? [], totalMode: v.totalMode ?? 'sum', scoreStep: v.scoreStep ?? 1 }
  } catch {
    return { subjects: [], totalMode: 'sum', scoreStep: 1 }
  }
}

const isAll = (me: StaffPrincipal) => me.perms.includes('*') || me.dataScope === 'ALL'

/**
 * 可见范围：全部 / 本校区 / 本人（本人创建的考试，或本人任课班级的考试）
 */
export function assessmentScope(me: StaffPrincipal): Prisma.AssessmentWhereInput {
  if (isAll(me)) return {}
  if (me.dataScope === 'CAMPUS' && me.campusId) return { campusId: me.campusId }
  return {
    OR: [
      { createdById: me.id },
      { classGroup: { teacherId: me.id } },
      { classGroup: { sessions: { some: { teacherId: me.id } } } },
    ],
  }
}

export async function loadAssessment(me: StaffPrincipal, id: number) {
  const a = await prisma.assessment.findFirst({ where: { id, deletedAt: null, ...assessmentScope(me) } })
  if (!a) throw notFound('考试不存在或无权查看')
  return a
}

export function assertManage(me: StaffPrincipal) {
  if (!hasPerm(me, 'grade.manage')) throw forbidden('没有录入成绩的权限')
}

export const passLine = (s: SubjectDef) => (s.pass ?? null) != null ? Number(s.pass) : Math.round(s.max * 0.6 * 100) / 100
const round = (n: number) => Math.round(n * 100) / 100

interface ScoreRow {
  studentId: number
  scores: string | null
  total: number | null
  absent: boolean
}

/** 统计：各科均分 / 最高 / 最低 / 及格率、总分分布、排名 */
export function computeStats(conf: AssessmentSubjects, rows: ScoreRow[]) {
  const parsed = rows.map((r) => ({ ...r, map: parseScores(r.scores) }))
  const present = parsed.filter((r) => !r.absent)
  const subjects = conf.subjects.map((s) => {
    const vals = present.map((r) => r.map[s.key]).filter((v): v is number => typeof v === 'number')
    const pass = passLine(s)
    return {
      key: s.key,
      name: s.name,
      max: s.max,
      pass,
      count: vals.length,
      avg: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      high: vals.length ? Math.max(...vals) : null,
      low: vals.length ? Math.min(...vals) : null,
      passRate: vals.length ? round((vals.filter((v) => v >= pass).length / vals.length) * 100) : null,
    }
  })
  const totals = present.map((r) => r.total).filter((v): v is number => typeof v === 'number')
  const fullMark = conf.totalMode === 'avg' ? Math.max(0, ...conf.subjects.map((s) => s.max)) : conf.subjects.reduce((a, s) => a + s.max, 0)
  // 分布：按总分占满分的百分比分 5 档
  const bands = [0, 0, 0, 0, 0] // <60, 60-70, 70-80, 80-90, >=90
  for (const t of totals) {
    const pct = fullMark ? (t / fullMark) * 100 : 0
    bands[pct >= 90 ? 4 : pct >= 80 ? 3 : pct >= 70 ? 2 : pct >= 60 ? 1 : 0]++
  }
  // 排名（同分同名次）
  const sorted = present.filter((r) => r.total != null).sort((a, b) => b.total! - a.total!)
  const rank = new Map<number, number>()
  sorted.forEach((r, i) => rank.set(r.studentId, i > 0 && sorted[i - 1].total === r.total ? rank.get(sorted[i - 1].studentId)! : i + 1))
  return {
    summary: {
      students: rows.length,
      entered: totals.length,
      absent: parsed.filter((r) => r.absent).length,
      fullMark,
      avg: totals.length ? round(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
      high: totals.length ? Math.max(...totals) : null,
      low: totals.length ? Math.min(...totals) : null,
    },
    subjects,
    bands,
    rank,
  }
}
