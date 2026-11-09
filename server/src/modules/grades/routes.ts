import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { prisma } from '../../lib/prisma'
import { parse, pageArgs, pageQuery, paged, zId, zIdParam, zOptStr } from '../../lib/http'
import { badRequest } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyStudent } from '../../lib/notify'
import { fmtZoned } from '../../lib/time'
import { workbookBuffer } from '../../lib/excel'
import { DICTS } from '../../dict'
import { EDU, TOTAL_MODES, cleanScores, computeTotal, defaultEdu, examCodesInUse, parseScores, saveEdu, subjectSchema } from '../../lib/educonfig'
import { PRESET_PARTS, applyPreset, presetSummaries } from '../../lib/presets'
import { andCampus, hasPerm, perm, staff, student, studentOnly } from '../../plugins/auth'
import { assertCanView, loadStudentOr404 } from '../students/service'
import { assertManage, assertTargets, assessmentScope, computeStats, loadAssessment, readSubjects, type AssessmentSubjects } from './service'

const VIEW = perm('grade.view', 'grade.manage')
const MANAGE = perm('grade.manage')
const EDU_ADMIN = perm('system.edu')

const subjectsBody = z
  .object({
    subjects: z.array(subjectSchema).min(1, '至少一个科目').max(30),
    totalMode: z.enum(TOTAL_MODES).default('sum'),
    scoreStep: z.coerce.number().positive().max(100).default(1),
  })
  .refine((v) => new Set(v.subjects.map((s) => s.key.toLowerCase())).size === v.subjects.length, { message: '科目代码不能重复', path: ['subjects'] })

const assessmentBody = z.object({
  name: z.string({ error: '请填写考试名称' }).trim().min(1, '请填写考试名称').max(60),
  kind: z.string({ error: '请选择考试类别' }).trim().min(1, '请选择考试类别').max(30),
  examDate: z.coerce.date({ error: '请选择考试日期' }),
  campusId: zId,
  classGroupId: z.preprocess((v) => (v === '' || v === 0 ? null : v), zId.nullable().optional()),
  conf: subjectsBody,
  published: z.boolean().default(false),
  note: zOptStr,
})

const scoreRows = z.array(
  z.object({
    studentId: zId,
    scores: z.record(z.string(), z.unknown()).nullable().optional(),
    total: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).nullable().optional()),
    absent: z.boolean().default(false),
    comment: z.string().trim().max(500).nullable().optional(),
  }),
).max(1000)

const studentLite = { select: { id: true, name: true, studentNo: true, deletedAt: true } } as const

async function memberIds(classGroupId: number | null | undefined, extra: number[] = []) {
  const ids = new Set(extra)
  if (classGroupId) {
    const links = await prisma.classGroupStudent.findMany({ where: { classGroupId, student: { deletedAt: null } }, select: { studentId: true } })
    for (const l of links) ids.add(l.studentId)
  }
  return [...ids]
}

function checkKind(kind: string) {
  if (!(DICTS.assessmentKinds as readonly string[]).includes(kind)) throw badRequest('考试类别不在可选范围内')
}

/** 学生某次考试的成绩行（含排名、班级均分） */
async function studentHistory(studentId: number, where: Prisma.AssessmentWhereInput = {}) {
  const rows = await prisma.assessmentScore.findMany({
    where: { studentId, assessment: { deletedAt: null, ...where } },
    include: { assessment: { include: { scores: { select: { studentId: true, scores: true, total: true, absent: true } } } } },
    orderBy: { assessment: { examDate: 'asc' } },
  })
  return rows.map((r) => {
    const a = r.assessment
    const conf = readSubjects(a.subjects)
    const stats = computeStats(conf, a.scores)
    const avgOf = Object.fromEntries(stats.subjects.map((s) => [s.key, s.avg]))
    return {
      assessmentId: a.id,
      name: a.name,
      kind: a.kind,
      examDate: a.examDate,
      conf,
      scores: parseScores(r.scores),
      total: r.total,
      absent: r.absent,
      comment: r.comment,
      rank: stats.rank.get(studentId) ?? null,
      ranked: stats.rank.size,
      avg: stats.summary.avg,
      fullMark: stats.summary.fullMark,
      subjectAvg: avgOf,
    }
  })
}

export default async function (app: FastifyInstance) {
  // ==================================================================
  // 成绩与档案设置 / 行业模板
  // ==================================================================
  app.get('/config', { preHandler: EDU_ADMIN }, async () => ({
    config: EDU,
    defaults: defaultEdu(),
    inUse: await examCodesInUse(),
    kinds: DICTS.assessmentKinds,
  }))

  app.put('/config', { preHandler: EDU_ADMIN }, async (req) => {
    const conf = await saveEdu(req.body)
    await audit(req, 'update', 'EduConfig', null)
    return conf
  })

  app.get('/presets', { preHandler: EDU_ADMIN }, async () => presetSummaries())

  app.post('/presets/:pid/apply', { preHandler: EDU_ADMIN }, async (req) => {
    const { pid } = parse(z.object({ pid: z.string() }), req.params)
    const { parts } = parse(z.object({ parts: z.array(z.enum(PRESET_PARTS)).min(1, '请至少选择一项').default([...PRESET_PARTS]) }), req.body ?? {})
    const result = await applyPreset(pid, parts)
    await audit(req, 'apply', 'Preset', pid, { parts, result })
    return { ok: true, result, config: EDU }
  })

  // ==================================================================
  // 考试列表 / 新建 / 编辑 / 删除
  // ==================================================================
  app.get('/assessments', { preHandler: VIEW }, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({
        q: z.string().optional(),
        kind: z.string().optional(),
        campusId: z.coerce.number().int().optional(),
        classGroupId: z.coerce.number().int().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        deleted: z.coerce.boolean().optional(),
      }),
      req.query,
    )
    const where: Prisma.AssessmentWhereInput = { deletedAt: q.deleted ? { not: null } : null, ...assessmentScope(me) }
    if (q.q) where.name = { contains: q.q }
    if (q.kind) where.kind = q.kind
    andCampus(where, q.campusId)
    if (q.classGroupId) where.classGroupId = q.classGroupId
    if (q.from || q.to) where.examDate = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) }
    const [items, total] = await Promise.all([
      prisma.assessment.findMany({
        where,
        ...pageArgs(q),
        orderBy: [{ examDate: 'desc' }, { id: 'desc' }],
        include: {
          campus: { select: { id: true, name: true } },
          classGroup: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          scores: { select: { studentId: true, scores: true, total: true, absent: true } },
        },
      }),
      prisma.assessment.count({ where }),
    ])
    return paged(
      items.map(({ scores, subjects, ...a }) => {
        const conf = readSubjects(subjects)
        const s = computeStats(conf, scores)
        return { ...a, conf, summary: s.summary }
      }),
      total,
      q,
    )
  })

  app.get('/assessments/:id', { preHandler: VIEW }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const a = await loadAssessment(me, id)
    const full = await prisma.assessment.findUniqueOrThrow({
      where: { id: a.id },
      include: {
        campus: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        scores: { include: { student: studentLite } },
      },
    })
    const conf = readSubjects(full.subjects)
    const stats = computeStats(conf, full.scores)
    const { subjects: _s, scores, ...rest } = full
    return {
      ...rest,
      conf,
      rows: scores
        .map((r) => ({
          studentId: r.studentId,
          student: r.student,
          scores: parseScores(r.scores),
          total: r.total,
          absent: r.absent,
          comment: r.comment,
          rank: stats.rank.get(r.studentId) ?? null,
        }))
        .sort((x, y) => x.student.studentNo.localeCompare(y.student.studentNo)),
      stats: { summary: stats.summary, subjects: stats.subjects, bands: stats.bands },
      canManage: hasPerm(me, 'grade.manage'),
    }
  })

  app.post('/assessments', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const body = parse(assessmentBody.extend({ studentIds: z.array(zId).max(1000).default([]) }), req.body)
    checkKind(body.kind)
    // 校区、关联班课、追加的学员都必须在当前账号的数据范围内（班课名单随班课一起授权）
    await assertTargets(me, { campusId: body.campusId, classGroupId: body.classGroupId, studentIds: body.studentIds })
    const ids = await memberIds(body.classGroupId, body.studentIds)
    const a = await prisma.assessment.create({
      data: {
        name: body.name,
        kind: body.kind,
        examDate: body.examDate,
        campusId: body.campusId,
        classGroupId: body.classGroupId ?? null,
        subjects: JSON.stringify(body.conf),
        published: body.published,
        note: body.note ?? null,
        createdById: me.id,
        scores: { create: ids.map((studentId) => ({ studentId })) },
      },
    })
    await audit(req, 'create', 'Assessment', a.id, { name: a.name, students: ids.length })
    return { id: a.id }
  })

  app.put('/assessments/:id', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const old = await loadAssessment(me, id)
    const body = parse(assessmentBody, req.body)
    checkKind(body.kind)
    await assertTargets(me, {
      campusId: body.campusId !== old.campusId ? body.campusId : undefined,
      classGroupId: body.classGroupId && body.classGroupId !== old.classGroupId ? body.classGroupId : undefined,
    })
    const conf = body.conf as AssessmentSubjects
    // 科目变化后重新计算总分（删除的科目分数一并移除）
    const rows = await prisma.assessmentScore.findMany({ where: { assessmentId: id } })
    await prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: {
          name: body.name, kind: body.kind, examDate: body.examDate, campusId: body.campusId, classGroupId: body.classGroupId ?? null,
          subjects: JSON.stringify(conf), published: body.published, note: body.note ?? null,
        },
      })
      for (const r of rows) {
        const kept: Record<string, number> = {}
        const map = parseScores(r.scores)
        for (const s of conf.subjects) if (typeof map[s.key] === 'number') kept[s.key] = Math.min(map[s.key], s.max)
        const total = conf.totalMode === 'manual' ? r.total : computeTotal(conf.subjects, kept, conf.totalMode, conf.scoreStep)
        await tx.assessmentScore.update({ where: { id: r.id }, data: { scores: Object.keys(kept).length ? JSON.stringify(kept) : null, total: r.absent ? null : total } })
      }
    })
    if (body.published && !old.published) await notifyPublished(id)
    await audit(req, 'update', 'Assessment', id)
    return { ok: true }
  })

  /** 发布 / 取消发布到学生端 */
  app.post('/assessments/:id/publish', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const { published } = parse(z.object({ published: z.boolean() }), req.body)
    const a = await loadAssessment(me, id)
    await prisma.assessment.update({ where: { id }, data: { published } })
    if (published && !a.published) await notifyPublished(id)
    await audit(req, published ? 'publish' : 'unpublish', 'Assessment', id)
    return { ok: true }
  })

  async function notifyPublished(id: number) {
    const a = await prisma.assessment.findUniqueOrThrow({ where: { id }, include: { scores: { select: { studentId: true, total: true, absent: true } } } })
    for (const s of a.scores) if (s.total != null || s.absent) await notifyStudent(s.studentId, `成绩已发布：${a.name}`, { link: '/portal/grades' })
  }

  app.delete('/assessments/:id', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    await loadAssessment(me, id)
    await prisma.assessment.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'Assessment', id)
    return { ok: true }
  })

  app.post('/assessments/:id/restore', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const a = await prisma.assessment.findFirst({ where: { id, deletedAt: { not: null }, ...assessmentScope(me) } })
    if (!a) throw badRequest('考试不存在或未删除')
    await prisma.assessment.update({ where: { id }, data: { deletedAt: null } })
    await audit(req, 'restore', 'Assessment', id)
    return { ok: true }
  })

  // ==================================================================
  // 参考名单 / 成绩录入
  // ==================================================================
  app.post('/assessments/:id/students', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const a = await loadAssessment(me, id)
    const body = parse(z.object({ studentIds: z.array(zId).max(1000).default([]), fromClass: z.boolean().default(false) }), req.body)
    await assertTargets(me, { studentIds: body.studentIds })
    const ids = await memberIds(body.fromClass ? a.classGroupId : null, body.studentIds)
    const valid = await prisma.student.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } })
    const existing = new Set((await prisma.assessmentScore.findMany({ where: { assessmentId: id }, select: { studentId: true } })).map((r) => r.studentId))
    const add = valid.map((s) => s.id).filter((sid) => !existing.has(sid))
    if (add.length) await prisma.assessmentScore.createMany({ data: add.map((studentId) => ({ assessmentId: id, studentId })) })
    await audit(req, 'addStudents', 'Assessment', id, { added: add.length })
    return { added: add.length }
  })

  app.delete('/assessments/:id/students/:studentId', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    const { id, studentId } = parse(z.object({ id: zId, studentId: zId }), req.params)
    await loadAssessment(me, id)
    await prisma.assessmentScore.deleteMany({ where: { assessmentId: id, studentId } })
    await audit(req, 'removeStudent', 'Assessment', id, { studentId })
    return { ok: true }
  })

  /** 批量保存成绩（只更新传入的学生；学生必须已在本次考试名单中） */
  app.put('/assessments/:id/scores', { preHandler: MANAGE }, async (req) => {
    const me = staff(req)
    assertManage(me)
    const { id } = parse(zIdParam, req.params)
    const a = await loadAssessment(me, id)
    const conf = readSubjects(a.subjects)
    const rows = parse(z.object({ rows: scoreRows }), req.body).rows
    const roster = await prisma.assessmentScore.findMany({
      where: { assessmentId: id, studentId: { in: rows.map((r) => r.studentId) } },
      select: { studentId: true, student: { select: { name: true } } },
    })
    const names = new Map(roster.map((s) => [s.studentId, s.student.name]))
    const data = rows.map((r) => {
      const name = names.get(r.studentId)
      if (!name) throw badRequest(`学员 ${r.studentId} 不在本次考试名单中，请先添加学员`)
      const scores = r.absent ? {} : cleanScores(conf.subjects, r.scores as Record<string, unknown> | null, name)
      let total = r.absent ? null : computeTotal(conf.subjects, scores, conf.totalMode, conf.scoreStep)
      if (conf.totalMode === 'manual' && !r.absent) total = r.total ?? null
      return {
        studentId: r.studentId,
        scores: Object.keys(scores).length ? JSON.stringify(scores) : null,
        total,
        absent: r.absent,
        comment: r.comment || null,
      }
    })
    await prisma.$transaction(async (tx) => {
      for (const { studentId, ...d } of data)
        await tx.assessmentScore.update({ where: { assessmentId_studentId: { assessmentId: id, studentId } }, data: d })
    })
    await audit(req, 'saveScores', 'Assessment', id, { rows: data.length })
    return { saved: data.length }
  })

  /** 导出 Excel：成绩单 + 统计 */
  app.get('/assessments/:id/export', { preHandler: VIEW }, async (req, reply) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const a = await loadAssessment(me, id)
    const conf = readSubjects(a.subjects)
    const scores = await prisma.assessmentScore.findMany({ where: { assessmentId: id }, include: { student: studentLite } })
    const stats = computeStats(conf, scores)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('成绩单')
    ws.addRow([a.name, fmtZoned(a.examDate, 'YYYY-MM-DD')])
    ws.addRow(['名次', '学号', '姓名', ...conf.subjects.map((s) => `${s.name}（${s.max}）`), '总分', '缺考', '评语'])
    const sorted = [...scores].sort((x, y) => (stats.rank.get(x.studentId) ?? 1e9) - (stats.rank.get(y.studentId) ?? 1e9) || x.student.studentNo.localeCompare(y.student.studentNo))
    for (const r of sorted) {
      const m = parseScores(r.scores)
      ws.addRow([stats.rank.get(r.studentId) ?? '', r.student.studentNo, r.student.name, ...conf.subjects.map((s) => m[s.key] ?? ''), r.total ?? '', r.absent ? '是' : '', r.comment ?? ''])
    }
    ws.getRow(2).font = { bold: true }
    ws.columns.forEach((c) => (c.width = 12))
    const st = wb.addWorksheet('统计')
    st.addRow(['科目', '满分', '及格线', '人数', '平均分', '最高分', '最低分', '及格率%'])
    for (const s of stats.subjects) st.addRow([s.name, s.max, s.pass, s.count, s.avg ?? '', s.high ?? '', s.low ?? '', s.passRate ?? ''])
    st.addRow([])
    st.addRow(['总分', stats.summary.fullMark, '', stats.summary.entered, stats.summary.avg ?? '', stats.summary.high ?? '', stats.summary.low ?? ''])
    st.getRow(1).font = { bold: true }
    st.columns.forEach((c) => (c.width = 12))
    const name = `${a.name}-成绩单.xlsx`
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
    return reply.send(await workbookBuffer(wb))
  })

  // ==================================================================
  // 学员成绩档案（学员详情「成绩」页签）
  // ==================================================================
  app.get('/students/:id', { preHandler: perm('grade.view', 'grade.manage', 'student.view', 'student.all', 'teacher.students') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await loadStudentOr404(id)
    const byGrade = hasPerm(me, 'grade.view') || hasPerm(me, 'grade.manage')
    if (!byGrade) assertCanView(me, s)
    // 有成绩权限：可看范围内的考试；否则（只能看该学员）看全部
    return studentHistory(id, byGrade ? assessmentScope(me) : {})
  })

  // ==================================================================
  // 学生端：我的成绩（只含已发布的考试）
  // ==================================================================
  app.get('/portal/mine', { preHandler: studentOnly }, async (req) => {
    const me = student(req)
    return studentHistory(me.id, { published: true })
  })
}
