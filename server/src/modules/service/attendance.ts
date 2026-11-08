import { workbookBuffer } from '../../lib/excel'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zId } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { fmtZoned } from '../../lib/time'
import { perm, staff, hasPerm, scopeWhere, type StaffPrincipal } from '../../plugins/auth'
import { DICTS } from '../../dict'
import { dateFilter } from './util'

const ATT_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE', 'EARLY_LEAVE'] as const
/** 计入「出勤次数」的状态 */
const ATTENDED = new Set(['PRESENT', 'LATE', 'EARLY_LEAVE'])
const attLabel = (v: string) => DICTS.attendanceStatuses.find((o) => o.value === v)?.label ?? v

/** 教师只有 attendance.manage 而无 schedule.edit：只看自己的课次 */
const onlyOwn = (me: StaffPrincipal) => !hasPerm(me, 'schedule.edit')

function sessionScope(me: StaffPrincipal): Prisma.SessionWhereInput {
  if (onlyOwn(me)) return { teacherId: me.id }
  return scopeWhere(me) as Prisma.SessionWhereInput
}

/** 能否管理某个班课的名单 */
async function assertClassAccess(me: StaffPrincipal, classGroupId: number) {
  const cg = await prisma.classGroup.findFirst({ where: { id: classGroupId, deletedAt: null } })
  if (!cg) throw notFound('班课不存在')
  if (onlyOwn(me) && !hasPerm(me, 'class.manage')) {
    const own = cg.teacherId === me.id || (await prisma.session.count({ where: { classGroupId, teacherId: me.id } })) > 0
    if (!own) throw forbidden('只能管理本人任课班级的名单')
  }
  return cg
}

const statsQuery = z.object({
  classGroupId: z.coerce.number().int().optional(),
  studentId: z.coerce.number().int().optional(),
  productId: z.coerce.number().int().optional(),
  campusId: z.coerce.number().int().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
type StatsQuery = z.infer<typeof statsQuery>

interface StudentStat {
  studentId: number
  studentNo: string
  name: string
  classNames: string[]
  total: number
  present: number
  absent: number
  leave: number
  late: number
  earlyLeave: number
  unrecorded: number
  attended: number
  rate: number | null
}

/** 出勤统计：总课次 = 该生所在班已开始且未取消的课次；出勤次数 = 出勤 + 迟到 + 早退 */
async function computeStats(me: StaffPrincipal, q: StatsQuery) {
  const cgWhere: Prisma.ClassGroupWhereInput = { deletedAt: null }
  if (q.classGroupId) cgWhere.id = q.classGroupId
  if (q.productId) cgWhere.productId = q.productId
  if (q.campusId) cgWhere.campusId = q.campusId
  if (q.studentId) cgWhere.students = { some: { studentId: q.studentId } }
  if (onlyOwn(me)) cgWhere.OR = [{ teacherId: me.id }, { sessions: { some: { teacherId: me.id } } }]
  else Object.assign(cgWhere, scopeWhere(me))

  const groups = await prisma.classGroup.findMany({
    where: cgWhere,
    select: { id: true, name: true, students: { select: { student: { select: { id: true, name: true, studentNo: true, deletedAt: true } } } } },
    orderBy: { id: 'desc' },
  })
  const groupIds = groups.map((g) => g.id)
  const sessionWhere: Prisma.SessionWhereInput = {
    classGroupId: { in: groupIds },
    kind: 'CLASS',
    status: { not: 'CANCELLED' },
    startAt: { lte: new Date(), ...(dateFilter(q.from, q.to) ?? {}) },
  }
  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    select: { id: true, classGroupId: true, startAt: true, title: true, teacher: { select: { name: true } } },
    orderBy: { startAt: 'asc' },
  })
  const sessionIds = sessions.map((s) => s.id)
  const atts = await prisma.attendance.findMany({
    where: { sessionId: { in: sessionIds }, ...(q.studentId ? { studentId: q.studentId } : {}) },
    include: { student: { select: { id: true, name: true, studentNo: true } } },
  })

  const sessionsByClass = new Map<number, number[]>()
  for (const s of sessions) {
    const arr = sessionsByClass.get(s.classGroupId!) ?? []
    arr.push(s.id)
    sessionsByClass.set(s.classGroupId!, arr)
  }
  const attMap = new Map<string, string>() // `${sessionId}:${studentId}` → status
  for (const a of atts) attMap.set(`${a.sessionId}:${a.studentId}`, a.status)

  const studentStats = new Map<number, StudentStat>()
  const byClass: { classGroupId: number; name: string; students: number; sessions: number; slots: number; attended: number; absent: number; leave: number; rate: number | null }[] = []

  for (const g of groups) {
    const sIds = sessionsByClass.get(g.id) ?? []
    // 名单成员 + 有出勤记录但已移出班级的学生
    const members = new Map<number, { id: number; name: string; studentNo: string }>()
    for (const l of g.students) if (!l.student.deletedAt) members.set(l.student.id, l.student)
    for (const a of atts) if (sIds.includes(a.sessionId) && !members.has(a.studentId)) members.set(a.studentId, a.student)
    if (q.studentId) for (const id of [...members.keys()]) if (id !== q.studentId) members.delete(id)

    const cls = { classGroupId: g.id, name: g.name, students: members.size, sessions: sIds.length, slots: 0, attended: 0, absent: 0, leave: 0, rate: null as number | null }
    for (const st of members.values()) {
      let row = studentStats.get(st.id)
      if (!row) {
        row = { studentId: st.id, studentNo: st.studentNo, name: st.name, classNames: [], total: 0, present: 0, absent: 0, leave: 0, late: 0, earlyLeave: 0, unrecorded: 0, attended: 0, rate: null }
        studentStats.set(st.id, row)
      }
      row.classNames.push(g.name)
      for (const sid of sIds) {
        row.total++
        cls.slots++
        const status = attMap.get(`${sid}:${st.id}`)
        if (!status) row.unrecorded++
        else if (status === 'PRESENT') row.present++
        else if (status === 'ABSENT') row.absent++
        else if (status === 'LEAVE') row.leave++
        else if (status === 'LATE') row.late++
        else if (status === 'EARLY_LEAVE') row.earlyLeave++
        if (status && ATTENDED.has(status)) cls.attended++
        if (status === 'ABSENT') cls.absent++
        if (status === 'LEAVE') cls.leave++
      }
    }
    cls.rate = cls.slots ? Math.round((cls.attended / cls.slots) * 1000) / 10 : null
    byClass.push(cls)
  }
  const students = [...studentStats.values()].map((r) => {
    r.attended = r.present + r.late + r.earlyLeave
    r.rate = r.total ? Math.round((r.attended / r.total) * 1000) / 10 : null
    return r
  })
  students.sort((a, b) => a.studentNo.localeCompare(b.studentNo))

  const totalSlots = students.reduce((s, r) => s + r.total, 0)
  const totalAttended = students.reduce((s, r) => s + r.attended, 0)
  const summary = {
    classes: groups.length,
    sessions: sessions.length,
    students: students.length,
    slots: totalSlots,
    attended: totalAttended,
    rate: totalSlots ? Math.round((totalAttended / totalSlots) * 1000) / 10 : null,
  }
  return { students, byClass, summary, sessions, atts, groups }
}

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('attendance.manage') }

  /** 班课课次列表（点名入口） */
  app.get('/attendance/sessions', guard, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({
        classGroupId: z.coerce.number().int().optional(),
        teacherId: z.coerce.number().int().optional(),
        campusId: z.coerce.number().int().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
      req.query,
    )
    const where: Prisma.SessionWhereInput = { kind: 'CLASS', status: { not: 'CANCELLED' }, classGroupId: { not: null }, ...sessionScope(me) }
    if (q.classGroupId) where.classGroupId = q.classGroupId
    if (q.teacherId && !onlyOwn(me)) where.teacherId = q.teacherId
    if (q.campusId) where.campusId = q.campusId
    const df = dateFilter(q.from, q.to)
    if (df) where.startAt = df
    const [rows, total] = await Promise.all([
      prisma.session.findMany({
        where,
        ...pageArgs(q),
        orderBy: { startAt: 'desc' },
        include: {
          classGroup: { select: { id: true, name: true, _count: { select: { students: true } } } },
          room: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          attendances: { select: { status: true } },
        },
      }),
      prisma.session.count({ where }),
    ])
    const items = rows.map(({ attendances, classGroup, ...s }) => ({
      ...s,
      classGroup: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
      expected: classGroup?._count.students ?? 0,
      recorded: attendances.length,
      attended: attendances.filter((a) => ATTENDED.has(a.status)).length,
      absent: attendances.filter((a) => a.status === 'ABSENT').length,
      leave: attendances.filter((a) => a.status === 'LEAVE').length,
    }))
    return paged(items, total, q)
  })

  /** 点名表：该班全部学生 + 当前出勤状态 */
  app.get('/attendance/sessions/:sessionId', guard, async (req) => {
    const me = staff(req)
    const { sessionId } = parse(z.object({ sessionId: zId }), req.params)
    const s = await prisma.session.findFirst({
      where: { id: sessionId, kind: 'CLASS', ...sessionScope(me) },
      include: {
        classGroup: { select: { id: true, name: true, students: { include: { student: { select: { id: true, name: true, studentNo: true, nameAlt: true, deletedAt: true } } } } } },
        room: { select: { name: true } },
        teacher: { select: { name: true } },
        attendances: { include: { student: { select: { id: true, name: true, studentNo: true, nameAlt: true } } } },
      },
    })
    if (!s) throw notFound('课次不存在或无权查看')
    const att = new Map(s.attendances.map((a) => [a.studentId, a]))
    const roster = new Map<number, { id: number; name: string; studentNo: string; nameAlt: string | null }>()
    for (const l of s.classGroup?.students ?? []) if (!l.student.deletedAt) roster.set(l.student.id, l.student)
    for (const a of s.attendances) if (!roster.has(a.studentId)) roster.set(a.studentId, a.student)
    const students = [...roster.values()]
      .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
      .map((st) => ({ ...st, status: att.get(st.id)?.status ?? null, note: att.get(st.id)?.note ?? null, recordedAt: att.get(st.id)?.recordedAt ?? null }))
    const { attendances: _a, classGroup, ...rest } = s
    void _a
    return { session: { ...rest, classGroup: classGroup ? { id: classGroup.id, name: classGroup.name } : null }, students }
  })

  /** 保存点名（upsert） */
  app.put('/attendance/sessions/:sessionId', guard, async (req) => {
    const me = staff(req)
    const { sessionId } = parse(z.object({ sessionId: zId }), req.params)
    const body = parse(
      z.object({
        records: z
          .array(z.object({ studentId: zId, status: z.enum(ATT_STATUSES), note: z.string().trim().max(500).optional().nullable() }))
          .min(1, '没有要保存的记录'),
      }),
      req.body,
    )
    const s = await prisma.session.findFirst({
      where: { id: sessionId, kind: 'CLASS', ...sessionScope(me) },
      include: { classGroup: { select: { students: { select: { studentId: true } } } }, attendances: { select: { studentId: true } } },
    })
    if (!s) throw notFound('课次不存在或无权操作')
    if (s.status === 'CANCELLED') throw badRequest('该课次已取消，不能点名')
    const allowed = new Set([...(s.classGroup?.students.map((x) => x.studentId) ?? []), ...s.attendances.map((a) => a.studentId)])
    const bad = body.records.filter((r) => !allowed.has(r.studentId))
    if (bad.length) throw badRequest('存在不属于该班级的学生，请先把学生加入班级名单')
    const now = new Date()
    await prisma.$transaction(
      body.records.map((r) =>
        prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
          create: { sessionId, studentId: r.studentId, status: r.status, note: r.note || null, recordedById: me.id, recordedAt: now },
          update: { status: r.status, note: r.note || null, recordedById: me.id, recordedAt: now },
        }),
      ),
    )
    await audit(req, 'update', 'Attendance', sessionId, { count: body.records.length })
    return { ok: true, saved: body.records.length }
  })

  // ---------------- 班级名单 ----------------
  app.get('/attendance/classes/:classGroupId/students', guard, async (req) => {
    const me = staff(req)
    const { classGroupId } = parse(z.object({ classGroupId: zId }), req.params)
    const cg = await assertClassAccess(me, classGroupId)
    const links = await prisma.classGroupStudent.findMany({
      where: { classGroupId, student: { deletedAt: null } },
      include: { student: { select: { id: true, name: true, studentNo: true, nameAlt: true, status: true, phone: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    return { classGroup: { id: cg.id, name: cg.name }, items: links.map((l) => ({ ...l.student, joinedAt: l.joinedAt })) }
  })

  /** 添加学生：studentIds 选择，或 importText 粘贴学号/姓名（一行一个） */
  app.post('/attendance/classes/:classGroupId/students', guard, async (req) => {
    const me = staff(req)
    const { classGroupId } = parse(z.object({ classGroupId: zId }), req.params)
    const body = parse(z.object({ studentIds: z.array(zId).optional(), importText: z.string().optional() }), req.body)
    await assertClassAccess(me, classGroupId)

    const ids = new Set(body.studentIds ?? [])
    const matched: { line: string; studentId: number; name: string; studentNo: string }[] = []
    const unmatched: { line: string; reason: string }[] = []
    const lines = (body.importText ?? '')
      .split(/\r?\n/)
      .map((l) => l.split(/[\t,，]/)[0].trim())
      .filter(Boolean)
    for (const line of lines) {
      const byNo = await prisma.student.findFirst({ where: { studentNo: line, deletedAt: null }, select: { id: true, name: true, studentNo: true } })
      if (byNo) {
        matched.push({ line, studentId: byNo.id, name: byNo.name, studentNo: byNo.studentNo })
        ids.add(byNo.id)
        continue
      }
      const byName = await prisma.student.findMany({ where: { OR: [{ name: line }, { nameAlt: line }], deletedAt: null }, select: { id: true, name: true, studentNo: true }, take: 3 })
      if (byName.length === 1) {
        matched.push({ line, studentId: byName[0].id, name: byName[0].name, studentNo: byName[0].studentNo })
        ids.add(byName[0].id)
      } else unmatched.push({ line, reason: byName.length ? '同名学员多于 1 人，请改用学号' : '未找到该学号 / 姓名' })
    }
    if (!ids.size) return { added: 0, existed: 0, matched, unmatched }
    const valid = await prisma.student.findMany({ where: { id: { in: [...ids] }, deletedAt: null }, select: { id: true } })
    const existing = await prisma.classGroupStudent.findMany({ where: { classGroupId, studentId: { in: valid.map((v) => v.id) } }, select: { studentId: true } })
    const existSet = new Set(existing.map((e) => e.studentId))
    const toAdd = valid.map((v) => v.id).filter((id) => !existSet.has(id))
    if (toAdd.length) await prisma.classGroupStudent.createMany({ data: toAdd.map((studentId) => ({ classGroupId, studentId })) })
    await audit(req, 'create', 'ClassGroupStudent', classGroupId, { added: toAdd })
    return { added: toAdd.length, existed: existSet.size, matched, unmatched }
  })

  app.delete('/attendance/classes/:classGroupId/students/:studentId', guard, async (req) => {
    const me = staff(req)
    const { classGroupId, studentId } = parse(z.object({ classGroupId: zId, studentId: zId }), req.params)
    await assertClassAccess(me, classGroupId)
    const r = await prisma.classGroupStudent.deleteMany({ where: { classGroupId, studentId } })
    if (!r.count) throw notFound('该学生不在班级名单中')
    await audit(req, 'delete', 'ClassGroupStudent', classGroupId, { studentId })
    return { ok: true }
  })

  /** 筛选用：有班课关联的课程（单期课程） */
  app.get('/attendance/products', guard, async () =>
    prisma.courseProduct.findMany({
      where: { deletedAt: null, classGroups: { some: { deletedAt: null } } },
      select: { id: true, name: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    }),
  )

  // ---------------- 统计 / 导出 ----------------
  app.get('/attendance/stats', guard, async (req) => {
    const me = staff(req)
    const q = parse(statsQuery, req.query)
    const { students, byClass, summary } = await computeStats(me, q)
    return { students, byClass, summary, formula: '出勤率 = 出勤次数 ÷ 总课次 × 100%；出勤次数 = 出勤 + 迟到 + 早退；总课次 = 所在班级已开始且未取消的课次' }
  })

  app.get('/attendance/export', guard, async (req, reply: FastifyReply) => {
    const me = staff(req)
    const q = parse(statsQuery, req.query)
    const { students, byClass, sessions, atts, groups } = await computeStats(me, q)
    const wb = new ExcelJS.Workbook()

    const ws1 = wb.addWorksheet('出勤统计')
    ws1.columns = [
      { header: '学号', key: 'studentNo', width: 14 },
      { header: '姓名', key: 'name', width: 12 },
      { header: '班级', key: 'classes', width: 30 },
      { header: '总课次', key: 'total', width: 8 },
      { header: '出勤', key: 'present', width: 8 },
      { header: '迟到', key: 'late', width: 8 },
      { header: '早退', key: 'earlyLeave', width: 8 },
      { header: '缺席', key: 'absent', width: 8 },
      { header: '请假', key: 'leave', width: 8 },
      { header: '未记录', key: 'unrecorded', width: 8 },
      { header: '出勤次数', key: 'attended', width: 10 },
      { header: '出勤率', key: 'rate', width: 10 },
    ]
    for (const r of students) ws1.addRow({ ...r, classes: r.classNames.join('、'), rate: r.rate == null ? '-' : `${r.rate}%` })
    ws1.addRow([])
    ws1.addRow(['口径：出勤率 = 出勤次数 ÷ 总课次 × 100%；出勤次数 = 出勤 + 迟到 + 早退'])

    const ws2 = wb.addWorksheet('出勤明细')
    ws2.columns = [
      { header: '日期', key: 'date', width: 18 },
      { header: '班级', key: 'cls', width: 26 },
      { header: '老师', key: 'teacher', width: 12 },
      { header: '学号', key: 'studentNo', width: 14 },
      { header: '姓名', key: 'name', width: 12 },
      { header: '状态', key: 'status', width: 10 },
      { header: '备注', key: 'note', width: 30 },
    ]
    const sessMap = new Map(sessions.map((s) => [s.id, s]))
    const clsName = new Map(groups.map((g) => [g.id, g.name]))
    const sorted = [...atts].sort((a, b) => +sessMap.get(a.sessionId)!.startAt - +sessMap.get(b.sessionId)!.startAt || a.student.studentNo.localeCompare(b.student.studentNo))
    for (const a of sorted) {
      const s = sessMap.get(a.sessionId)!
      ws2.addRow({ date: fmtZoned(s.startAt), cls: clsName.get(s.classGroupId!) ?? s.title, teacher: s.teacher?.name ?? '', studentNo: a.student.studentNo, name: a.student.name, status: attLabel(a.status), note: a.note ?? '' })
    }

    const ws3 = wb.addWorksheet('班级汇总')
    ws3.columns = [
      { header: '班级', key: 'name', width: 28 },
      { header: '学生数', key: 'students', width: 10 },
      { header: '课次数', key: 'sessions', width: 10 },
      { header: '应出勤人次', key: 'slots', width: 12 },
      { header: '出勤人次', key: 'attended', width: 12 },
      { header: '缺席', key: 'absent', width: 8 },
      { header: '请假', key: 'leave', width: 8 },
      { header: '出勤率', key: 'rate', width: 10 },
    ]
    for (const c of byClass) ws3.addRow({ ...c, rate: c.rate == null ? '-' : `${c.rate}%` })
    for (const ws of [ws1, ws2, ws3]) ws.getRow(1).font = { bold: true }

    const name = `出勤统计_${fmtZoned(new Date(), 'YYYYMMDD')}.xlsx`
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
    return reply.send(await workbookBuffer(wb))
  })
}
