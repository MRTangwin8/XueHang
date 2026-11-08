import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zId, zOptStr } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyStudent, notifyUser } from '../../lib/notify'
import { dayjs, fmtZoned } from '../../lib/time'
import { hasPerm, perm, staff, type StaffPrincipal } from '../../plugins/auth'
import { campusTz, dateFilter } from './util'

const KIND = z.enum(['CONSULT', 'EXAM'])
export const kindLabel = (k: string) => (k === 'EXAM' ? '面试' : '面谈')
const HM = z.string().regex(/^\d{2}:\d{2}$/, '时间格式应为 HH:mm')
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')

const batchBody = z.object({
  kind: KIND,
  title: z.string().trim().min(1, '请填写标题').max(100),
  hostId: zId,
  campusId: z.number().int().optional().nullable(),
  location: zOptStr,
  online: z.boolean().default(false),
  dates: z.union([
    z.array(YMD).min(1, '请选择日期'),
    z.object({ startDate: YMD, endDate: YMD, weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, '请选择星期') }),
  ]),
  times: z.array(z.object({ start: HM, end: HM })).min(1, '请至少添加一个时间段'),
  preview: z.boolean().optional(),
})

const recordBody = z.object({
  slotId: zId.optional().nullable(),
  studentId: zId.optional(),
  teacherId: zId.optional(),
  kind: KIND.optional(),
  heldAt: z.coerce.date().optional(),
  durationMin: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  japanese: zOptStr,
  english: zOptStr,
  liberalArts: zOptStr,
  math: zOptStr,
  targetSchools: zOptStr,
  guidance: zOptStr,
  content: zOptStr,
})

const slotInclude = {
  host: { select: { id: true, name: true } },
  student: { select: { id: true, name: true, studentNo: true } },
  campus: { select: { id: true, name: true } },
  record: { select: { id: true } },
} satisfies Prisma.InterviewSlotInclude

// ---------------- 数据范围（校区）校验 ----------------
// 数据范围为 ALL 或超级管理员：不限；其他（CAMPUS / SELF）：只能操作本校区的时间段、学员和老师。

const campusLimitOf = (me: StaffPrincipal) => (hasPerm(me, '*') || me.dataScope === 'ALL' ? null : me.campusId)

function assertSlotAccess(me: StaffPrincipal, slot: { campusId: number | null; hostId: number }) {
  const lim = campusLimitOf(me)
  if (lim && slot.campusId && slot.campusId !== lim && slot.hostId !== me.id) throw forbidden('无权操作其他校区的时间段')
}

async function assertStudentAccess(me: StaffPrincipal, studentId: number) {
  const s = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { campusId: true } })
  if (!s) throw badRequest('学员不存在')
  const lim = campusLimitOf(me)
  if (lim && s.campusId !== lim) throw forbidden('无权操作其他校区的学员')
}

async function assertTeacherAccess(me: StaffPrincipal, teacherId: number) {
  const u = await prisma.user.findFirst({ where: { id: teacherId, deletedAt: null, status: 'ACTIVE' }, select: { campusId: true } })
  if (!u) throw badRequest('老师不存在或已停用')
  const lim = campusLimitOf(me)
  if (lim && u.campusId && u.campusId !== lim) throw forbidden('只能指定本校区的老师')
}

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('interview.manage') }

  app.get('/interviews/slots', guard, async (req) => {
    const q = parse(
      pageQuery.extend({
        pageSize: z.coerce.number().int().min(1).max(500).default(100),
        kind: KIND.optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        hostId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        studentId: z.coerce.number().int().optional(),
        campusId: z.coerce.number().int().optional(),
      }),
      req.query,
    )
    const me = staff(req)
    const lim = campusLimitOf(me)
    const where: Prisma.InterviewSlotWhereInput = { deletedAt: null }
    // 范围条件放在 AND 里，任何查询参数都无法覆盖
    if (lim) where.AND = [{ OR: [{ campusId: lim }, { campusId: null }, { hostId: me.id }] }]
    if (q.kind) where.kind = q.kind
    if (q.hostId) where.hostId = q.hostId
    if (q.status) where.status = { in: q.status.split(',') }
    if (q.studentId) where.studentId = q.studentId
    if (q.campusId) where.campusId = q.campusId
    const df = dateFilter(q.from, q.to)
    if (df) where.startAt = df
    const [items, total, counts] = await Promise.all([
      prisma.interviewSlot.findMany({ where, ...pageArgs(q), orderBy: { startAt: 'asc' }, include: slotInclude }),
      prisma.interviewSlot.count({ where }),
      prisma.interviewSlot.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: true }),
    ])
    return { ...paged(items, total, q), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) }
  })

  /** 批量发布时间段：日期（多选或区间 + 星期）× 自定义时段；跳过与同一主持人已有时间段重叠的 */
  app.post('/interviews/slots/batch', guard, async (req) => {
    const me = staff(req)
    const b = parse(batchBody, req.body)
    const host = await prisma.user.findFirst({ where: { id: b.hostId, deletedAt: null }, select: { id: true, campusId: true, name: true } })
    if (!host) throw badRequest('主持老师不存在')
    await assertTeacherAccess(me, host.id)
    const campusId = b.campusId ?? host.campusId ?? me.campusId
    const lim = campusLimitOf(me)
    if (lim && campusId && campusId !== lim) throw forbidden('只能在本校区发布时间段')
    const tz = await campusTz(campusId)

    let dates: string[]
    if (Array.isArray(b.dates)) dates = [...new Set(b.dates)].sort()
    else {
      const { startDate, endDate, weekdays } = b.dates
      const s = dayjs.tz(startDate, 'YYYY-MM-DD', tz)
      const e = dayjs.tz(endDate, 'YYYY-MM-DD', tz)
      if (e.isBefore(s)) throw badRequest('结束日期不能早于开始日期')
      if (e.diff(s, 'day') > 366) throw badRequest('日期区间不能超过一年')
      dates = []
      for (let d = s; !d.isAfter(e); d = d.add(1, 'day')) if (weekdays.includes(d.isoWeekday())) dates.push(d.format('YYYY-MM-DD'))
    }
    for (const t of b.times) if (t.end <= t.start) throw badRequest(`时间段 ${t.start}-${t.end} 结束时间必须晚于开始时间`)

    const cand = dates.flatMap((date) =>
      b.times.map((t) => ({
        date,
        start: t.start,
        end: t.end,
        startAt: dayjs.tz(`${date} ${t.start}`, 'YYYY-MM-DD HH:mm', tz).toDate(),
        endAt: dayjs.tz(`${date} ${t.end}`, 'YYYY-MM-DD HH:mm', tz).toDate(),
      })),
    )
    if (cand.length > 1000) throw badRequest('一次最多生成 1000 个时间段')
    if (!cand.length) throw badRequest('所选日期范围内没有符合条件的日期')
    const minStart = new Date(Math.min(...cand.map((c) => +c.startAt)))
    const maxEnd = new Date(Math.max(...cand.map((c) => +c.endAt)))
    const existing = await prisma.interviewSlot.findMany({
      where: { hostId: b.hostId, deletedAt: null, status: { not: 'CANCELLED' }, startAt: { lt: maxEnd }, endAt: { gt: minStart } },
      select: { startAt: true, endAt: true },
    })
    const taken = existing.map((e) => ({ s: +e.startAt, e: +e.endAt }))
    const now = Date.now()
    const create: typeof cand = []
    const skipped: { date: string; start: string; end: string; reason: string }[] = []
    for (const c of cand) {
      const s = +c.startAt
      const e = +c.endAt
      if (s <= now) skipped.push({ date: c.date, start: c.start, end: c.end, reason: '时间已过' })
      else if (taken.some((t) => t.s < e && t.e > s)) skipped.push({ date: c.date, start: c.start, end: c.end, reason: '与该老师已有时间段重叠' })
      else {
        create.push(c)
        taken.push({ s, e })
      }
    }
    const view = create.map(({ date, start, end }) => ({ date, start, end }))
    if (b.preview) return { preview: true, slots: view, skipped }
    if (!create.length) throw badRequest('没有可生成的时间段（全部重叠或已过期）', { skipped })
    await prisma.interviewSlot.createMany({
      data: create.map((c) => ({ kind: b.kind, title: b.title, hostId: b.hostId, campusId, location: b.location ?? null, online: b.online, startAt: c.startAt, endAt: c.endAt })),
    })
    await audit(req, 'create', 'InterviewSlot', null, { kind: b.kind, hostId: b.hostId, count: create.length })
    return { created: create.length, slots: view, skipped }
  })

  /** 修改单个时间段（地点 / 线上 / 标题） */
  app.put('/interviews/slots/:id', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ title: z.string().trim().min(1).max(100).optional(), location: zOptStr, online: z.boolean().optional(), bookingNote: zOptStr }), req.body)
    const slot = await prisma.interviewSlot.findFirst({ where: { id, deletedAt: null } })
    if (!slot) throw notFound('时间段不存在')
    assertSlotAccess(staff(req), slot)
    const r = await prisma.interviewSlot.update({ where: { id }, data: b, include: slotInclude })
    await audit(req, 'update', 'InterviewSlot', id, b)
    return r
  })

  /** 删除：未预约直接删；已预约则取消并通知学生 */
  app.delete('/interviews/slots/:id', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const slot = await prisma.interviewSlot.findFirst({ where: { id, deletedAt: null }, include: { record: { select: { id: true } } } })
    if (!slot) throw notFound('时间段不存在')
    assertSlotAccess(staff(req), slot)
    if (slot.record) throw badRequest('该时间段已有面谈记录，不能删除')
    if (slot.status === 'BOOKED' && slot.studentId) {
      await prisma.interviewSlot.update({ where: { id }, data: { status: 'CANCELLED' } })
      await notifyStudent(slot.studentId, `您预约的${kindLabel(slot.kind)}（${fmtZoned(slot.startAt)}）已被老师取消`, {
        content: '如需重新预约，请选择其他时间段。',
        link: '/portal/interviews',
      })
      await audit(req, 'cancel', 'InterviewSlot', id)
      return { ok: true, cancelled: true }
    }
    await prisma.interviewSlot.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'InterviewSlot', id)
    return { ok: true, deleted: true }
  })

  /** 教职工代约 */
  app.post('/interviews/slots/:id/book', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ studentId: zId, note: zOptStr }), req.body)
    const me = staff(req)
    const target = await prisma.interviewSlot.findFirst({ where: { id, deletedAt: null }, select: { campusId: true, hostId: true } })
    if (!target) throw notFound('时间段不存在')
    assertSlotAccess(me, target)
    await assertStudentAccess(me, b.studentId)
    const st = await prisma.student.findFirst({ where: { id: b.studentId, deletedAt: null }, select: { id: true, name: true } })
    if (!st) throw badRequest('学员不存在')
    const r = await prisma.interviewSlot.updateMany({
      where: { id, status: 'OPEN', deletedAt: null },
      data: { studentId: b.studentId, status: 'BOOKED', bookedAt: new Date(), bookingNote: b.note ?? null },
    })
    if (!r.count) throw conflict('该时间段已被预约或不可用')
    const slot = await prisma.interviewSlot.findUniqueOrThrow({ where: { id }, include: slotInclude })
    await notifyStudent(st.id, `已为您预约${kindLabel(slot.kind)}：${fmtZoned(slot.startAt)}`, { content: `${slot.title} · ${slot.host.name}`, link: '/portal/interviews' })
    if (slot.hostId !== staff(req).id) await notifyUser(slot.hostId, `新的${kindLabel(slot.kind)}预约：${st.name} ${fmtZoned(slot.startAt)}`, { link: slot.kind === 'EXAM' ? '/service/exams' : '/service/interviews' })
    await audit(req, 'book', 'InterviewSlot', id, { studentId: st.id })
    return slot
  })

  /** 教职工取消预约（恢复为可预约） */
  app.post('/interviews/slots/:id/cancel-booking', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const slot = await prisma.interviewSlot.findFirst({ where: { id, deletedAt: null }, include: { record: { select: { id: true } } } })
    if (!slot) throw notFound('时间段不存在')
    assertSlotAccess(staff(req), slot)
    if (slot.status !== 'BOOKED' || !slot.studentId) throw badRequest('该时间段当前没有预约')
    if (slot.record) throw badRequest('已有面谈记录，不能取消预约')
    await prisma.interviewSlot.update({ where: { id }, data: { status: 'OPEN', studentId: null, bookedAt: null, bookingNote: null } })
    await notifyStudent(slot.studentId, `您预约的${kindLabel(slot.kind)}（${fmtZoned(slot.startAt)}）已被取消`, { link: '/portal/interviews' })
    await audit(req, 'cancel-booking', 'InterviewSlot', id, { studentId: slot.studentId })
    return { ok: true }
  })

  // ---------------- 面谈 / 面试记录 ----------------
  app.get('/interviews/records', guard, async (req) => {
    const q = parse(
      pageQuery.extend({
        studentId: z.coerce.number().int().optional(),
        teacherId: z.coerce.number().int().optional(),
        kind: KIND.optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        q: z.string().optional(),
      }),
      req.query,
    )
    const lim = campusLimitOf(staff(req))
    const where: Prisma.InterviewRecordWhereInput = {}
    if (q.studentId) where.studentId = q.studentId
    if (q.teacherId) where.teacherId = q.teacherId
    if (q.kind) where.kind = q.kind
    const df = dateFilter(q.from, q.to)
    if (df) where.heldAt = df
    // 学员条件：关键字 + 校区范围（范围条件不可被参数覆盖）
    const studentWhere: Prisma.StudentWhereInput = {}
    if (q.q) studentWhere.OR = [{ name: { contains: q.q } }, { studentNo: { contains: q.q } }]
    if (lim) studentWhere.campusId = lim
    if (Object.keys(studentWhere).length) where.student = studentWhere
    const [items, total] = await Promise.all([
      prisma.interviewRecord.findMany({
        where,
        ...pageArgs(q),
        orderBy: { heldAt: 'desc' },
        include: { student: { select: { id: true, name: true, studentNo: true } }, teacher: { select: { id: true, name: true } }, slot: { select: { id: true, title: true, startAt: true } } },
      }),
      prisma.interviewRecord.count({ where }),
    ])
    return paged(items, total, q)
  })

  app.post('/interviews/records', guard, async (req) => {
    const me = staff(req)
    const b = parse(recordBody, req.body)
    let { studentId, kind, heldAt } = b
    if (b.slotId) {
      const slot = await prisma.interviewSlot.findFirst({ where: { id: b.slotId, deletedAt: null }, include: { record: true } })
      if (!slot) throw badRequest('关联的时间段不存在')
      if (slot.record) throw conflict('该时间段已有记录，请直接编辑')
      if (!slot.studentId) throw badRequest('该时间段尚无学生预约')
      studentId = slot.studentId
      kind = slot.kind as 'CONSULT' | 'EXAM'
      heldAt = heldAt ?? slot.startAt
    }
    if (!studentId) throw badRequest('请选择学生')
    await assertStudentAccess(me, studentId)
    if (b.teacherId) await assertTeacherAccess(me, b.teacherId)
    const data = {
      slotId: b.slotId ?? null,
      studentId,
      teacherId: b.teacherId ?? me.id,
      kind: kind ?? 'CONSULT',
      heldAt: heldAt ?? new Date(),
      durationMin: b.durationMin ?? null,
      japanese: b.japanese ?? null,
      english: b.english ?? null,
      liberalArts: b.liberalArts ?? null,
      math: b.math ?? null,
      targetSchools: b.targetSchools ?? null,
      guidance: b.guidance ?? null,
      content: b.content ?? null,
    }
    const rec = await prisma.$transaction(async (tx) => {
      const r = await tx.interviewRecord.create({ data })
      if (b.slotId) await tx.interviewSlot.update({ where: { id: b.slotId }, data: { status: 'DONE' } })
      return r
    })
    await audit(req, 'create', 'InterviewRecord', rec.id, { studentId, slotId: b.slotId })
    return rec
  })

  app.put('/interviews/records/:id', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(recordBody.omit({ slotId: true }), req.body)
    const old = await prisma.interviewRecord.findUnique({ where: { id } })
    if (!old) throw notFound('记录不存在')
    const me = staff(req)
    await assertStudentAccess(me, old.studentId)
    if (b.teacherId && b.teacherId !== old.teacherId) await assertTeacherAccess(me, b.teacherId)
    if (b.studentId && b.studentId !== old.studentId && !old.slotId) await assertStudentAccess(me, b.studentId)
    const data: Prisma.InterviewRecordUncheckedUpdateInput = {}
    for (const k of ['durationMin', 'japanese', 'english', 'liberalArts', 'math', 'targetSchools', 'guidance', 'content'] as const) if (b[k] !== undefined) data[k] = b[k]
    if (b.heldAt) data.heldAt = b.heldAt
    if (b.teacherId) data.teacherId = b.teacherId
    if (!old.slotId) {
      if (b.studentId) data.studentId = b.studentId
      if (b.kind) data.kind = b.kind
    }
    const r = await prisma.interviewRecord.update({ where: { id }, data })
    await audit(req, 'update', 'InterviewRecord', id)
    return r
  })

  app.delete('/interviews/records/:id', guard, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.interviewRecord.findUnique({ where: { id } })
    if (!old) throw notFound('记录不存在')
    await assertStudentAccess(staff(req), old.studentId)
    await prisma.$transaction(async (tx) => {
      await tx.interviewRecord.delete({ where: { id } })
      if (old.slotId) await tx.interviewSlot.update({ where: { id: old.slotId }, data: { status: 'BOOKED' } })
    })
    await audit(req, 'delete', 'InterviewRecord', id, old)
    return { ok: true }
  })
}
