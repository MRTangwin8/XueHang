/** 课次：查询 / 冲突检测 / 新建 / 批量排课 / 修改 / 取消 / 确认 / 课堂记录 */
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma, type Tx } from '../../lib/prisma'
import { parse, zId, zIdParam } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { hasPerm, perm, staff, type StaffPrincipal } from '../../plugins/auth'
import { audit } from '../../lib/audit'
import {
  adjustHours, assertRange, campusTz, canEditSession, cancelSession, confirmSession, durationHours, expandDates,
  findConflicts, isOwnOnly, loadBookablePackage, localParts, remainingOf, reserveHours, round2, zHHmm, zYmd, zoned,
  type ConflictInfo, type ConflictQuery,
} from './service'

const zBool = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1')
const zHours = z.coerce.number().min(0, '课时不能为负').max(12, '单节课时不能超过 12h')
const zKind = z.enum(['CLASS', 'VIP', 'OTHER'])
const zScope = z.enum(['one', 'following', 'all']).default('one')

/** 课次列表 / 详情通用 include */
export const sessionInclude = {
  room: { select: { id: true, name: true, building: true, campusId: true } },
  teacher: { select: { id: true, name: true } },
  classGroup: { select: { id: true, name: true } },
  vipPackage: { select: { id: true, name: true, student: { select: { id: true, name: true } } } },
  series: { select: { id: true, startDate: true, endDate: true, weekdays: true, startTime: true, endTime: true } },
  lessonRecord: { select: { id: true } },
} satisfies Prisma.SessionInclude

type SessionRow = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>

export function presentSession(s: SessionRow, me: StaffPrincipal) {
  const { lessonRecord, ...rest } = s
  return { ...rest, hasRecord: !!lessonRecord, canEdit: canEditSession(me, s) }
}

// ------------------------------------------------------------
// 新建课次的入参归一化（单个 / 批量共用）
// ------------------------------------------------------------
const zSessionBase = z.object({
  kind: zKind,
  campusId: zId.optional().nullable(),
  title: z.string().trim().max(100).optional().nullable(),
  roomId: zId.optional().nullable(),
  teacherId: zId.optional().nullable(),
  classGroupId: zId.optional().nullable(),
  vipPackageId: zId.optional().nullable(),
  hours: zHours.optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  force: z.boolean().optional(),
})
type SessionBase = z.infer<typeof zSessionBase>

interface Resolved {
  kind: string
  campusId: number
  tz: string
  title: string
  roomId: number | null
  teacherId: number | null
  classGroupId: number | null
  vipPackageId: number | null
  /** 单节课时（VIP 扣除；班课记录时长；其他占用为 0） */
  hours: number
  note: string | null
}

async function resolveInput(tx: Tx, me: StaffPrincipal, b: SessionBase, duration: number): Promise<Resolved> {
  let campusId = b.campusId ?? null
  /** 校区优先级：显式传入 > 教室所在校区 > 班级 / 学员所在校区 */
  let fallbackCampus: number | null = null
  let title = b.title || ''
  let teacherId = b.teacherId ?? null
  let roomId = b.roomId ?? null
  let hours = 0

  if (b.kind === 'CLASS') {
    if (!b.classGroupId) throw badRequest('请选择班课')
    const cg = await tx.classGroup.findFirst({ where: { id: b.classGroupId, deletedAt: null } })
    if (!cg) throw badRequest('班课不存在')
    if (cg.status !== 'ACTIVE') throw badRequest('该班课已结课，不能再排课')
    fallbackCampus = cg.campusId
    title ||= cg.name
    if (b.teacherId === undefined) teacherId = cg.teacherId
    if (b.roomId === undefined) roomId = cg.defaultRoomId
    hours = b.hours ?? duration
  } else if (b.kind === 'VIP') {
    if (!b.vipPackageId) throw badRequest('请选择 VIP 课时包')
    const pkg = await loadBookablePackage(tx, b.vipPackageId)
    fallbackCampus = pkg.student.campusId
    title ||= `VIP ${pkg.student.name}`
    if (b.teacherId === undefined && pkg.teachers.length === 1) teacherId = pkg.teachers[0].teacherId
    if (isOwnOnly(me) && !pkg.teachers.some((t) => t.teacherId === me.id)) throw forbidden('您不是该 VIP 学生的任课老师')
    hours = b.hours ?? duration
    if (hours <= 0) throw badRequest('VIP 课时必须大于 0')
  } else {
    if (!title) throw badRequest('请填写占用事由（标题）')
    hours = 0
  }

  if (roomId) {
    const room = await tx.room.findUnique({ where: { id: roomId } })
    if (!room || !room.active) throw badRequest('教室不存在或已停用')
    if (campusId && room.campusId !== campusId) throw badRequest('所选教室不属于该校区')
    if (b.kind === 'VIP' && !room.allowVip) throw badRequest(`教室「${room.name}」不可用于 VIP 课`)
    campusId = room.campusId
  }
  campusId ??= fallbackCampus
  if (!campusId) throw badRequest('请选择校区')
  if (teacherId) {
    const t = await tx.user.findFirst({ where: { id: teacherId, deletedAt: null }, select: { id: true } })
    if (!t) throw badRequest('老师不存在')
  }
  if (isOwnOnly(me) && teacherId !== me.id) throw forbidden('教师只能为自己安排课次')

  return {
    kind: b.kind, campusId, tz: await campusTz(tx, campusId), title, roomId, teacherId,
    classGroupId: b.kind === 'CLASS' ? b.classGroupId! : null,
    vipPackageId: b.kind === 'VIP' ? b.vipPackageId! : null,
    hours: round2(hours), note: b.note || null,
  }
}

const canForce = (me: StaffPrincipal, force?: boolean) => !!force && hasPerm(me, 'schedule.edit')

// ------------------------------------------------------------
// 批量排课：入参 + 展开
// ------------------------------------------------------------
const zBatch = zSessionBase.extend({
  startDate: z.string().regex(zYmd, '开始日期格式应为 YYYY-MM-DD'),
  endDate: z.string().regex(zYmd, '结束日期格式应为 YYYY-MM-DD'),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, '请至少选择一个星期'),
  startTime: z.string().regex(zHHmm, '开始时刻格式应为 HH:mm'),
  endTime: z.string().regex(zHHmm, '结束时刻格式应为 HH:mm'),
  skipConflicts: z.boolean().optional(),
})
const BATCH_LIMIT = 200

async function expandBatch(tx: Tx, me: StaffPrincipal, b: z.infer<typeof zBatch>) {
  if (b.endDate < b.startDate) throw badRequest('结束日期不能早于开始日期')
  if (b.endTime <= b.startTime) throw badRequest('结束时刻必须晚于开始时刻')
  const dates = expandDates(b.startDate, b.endDate, b.weekdays)
  if (!dates.length) throw badRequest('所选日期区间内没有符合星期条件的日期')
  if (dates.length > BATCH_LIMIT) throw badRequest(`一次最多生成 ${BATCH_LIMIT} 节课次（当前 ${dates.length} 节），请缩短日期区间`)
  const ref = zoned(b.startDate, b.startTime, 'UTC')
  const duration = durationHours(ref, zoned(b.startDate, b.endTime, 'UTC'))
  const r = await resolveInput(tx, me, b, duration)
  const items = dates.map((d) => ({ ...d, startAt: zoned(d.date, b.startTime, r.tz), endAt: zoned(d.date, b.endTime, r.tz) }))
  items.forEach((i) => assertRange(i.startAt, i.endAt))
  const conflicts = await findConflicts(tx, items.map((i) => ({ roomId: r.roomId, teacherId: r.teacherId, vipPackageId: r.vipPackageId, startAt: i.startAt, endAt: i.endAt })))
  return { r, items: items.map((i, k) => ({ ...i, conflicts: conflicts[k] })) }
}

/** 系列中参与批量操作的课次 */
async function seriesTargets(tx: Tx, target: { id: number; seriesId: number | null; startAt: Date }, scope: 'one' | 'following' | 'all') {
  if (scope === 'one' || !target.seriesId) return null
  return tx.session.findMany({
    where: { seriesId: target.seriesId, status: 'SCHEDULED', ...(scope === 'following' ? { startAt: { gte: target.startAt } } : {}) },
    orderBy: { startAt: 'asc' },
  })
}

export default async function (app: FastifyInstance) {
  const viewPerm = perm('schedule.view', 'schedule.own')
  const editPerm = perm('schedule.edit', 'schedule.own')

  // ======================= 查询 =======================
  app.get('/sessions', { preHandler: viewPerm }, async (req) => {
    const me = staff(req)
    const q = parse(
      z.object({
        from: z.coerce.date({ message: '请提供开始日期 from' }),
        to: z.coerce.date({ message: '请提供结束日期 to' }),
        campusId: zId.optional(),
        roomId: zId.optional(),
        teacherId: zId.optional(),
        kind: z.string().optional(),
        classGroupId: zId.optional(),
        vipPackageId: zId.optional(),
        status: z.string().optional(),
        includeCancelled: zBool.optional(),
      }),
      req.query,
    )
    if (q.to <= q.from) throw badRequest('结束日期必须晚于开始日期')
    if (q.to.getTime() - q.from.getTime() > 62 * 86_400_000) throw badRequest('查询跨度不能超过 62 天')
    const where: Prisma.SessionWhereInput = { startAt: { lt: q.to }, endAt: { gt: q.from } }
    if (q.campusId) where.campusId = q.campusId
    if (q.roomId) where.roomId = q.roomId
    if (q.teacherId) where.teacherId = q.teacherId
    if (q.kind) where.kind = { in: q.kind.split(',') }
    if (q.classGroupId) where.classGroupId = q.classGroupId
    if (q.vipPackageId) where.vipPackageId = q.vipPackageId
    if (q.status) where.status = { in: q.status.split(',') }
    else if (!q.includeCancelled) where.status = { not: 'CANCELLED' }
    if (!hasPerm(me, 'schedule.view')) where.teacherId = me.id
    const rows = await prisma.session.findMany({ where, include: sessionInclude, orderBy: [{ startAt: 'asc' }, { roomId: 'asc' }] })
    return rows.map((s) => presentSession(s, me))
  })

  app.get('/sessions/:id', { preHandler: viewPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await prisma.session.findUnique({
      where: { id },
      include: {
        ...sessionInclude,
        campus: { select: { id: true, name: true, timezone: true } },
        classGroup: { select: { id: true, name: true, _count: { select: { students: true } } } },
        vipPackage: {
          select: {
            id: true, name: true, status: true, totalHours: true, usedHours: true, pendingHours: true,
            student: { select: { id: true, name: true, studentNo: true } },
          },
        },
        lessonRecord: { include: { teacher: { select: { id: true, name: true } } } },
      },
    })
    if (!s) throw notFound('课次不存在')
    if (!hasPerm(me, 'schedule.view') && s.teacherId !== me.id) throw forbidden()
    const seriesCount = s.seriesId ? await prisma.session.count({ where: { seriesId: s.seriesId, status: { not: 'CANCELLED' } } }) : 0
    const { lessonRecord, vipPackage, ...rest } = s
    return {
      ...rest,
      vipPackage: vipPackage ? { ...vipPackage, remaining: remainingOf(vipPackage) } : null,
      record: lessonRecord,
      hasRecord: !!lessonRecord,
      seriesCount,
      canEdit: canEditSession(me, s),
      canCancelConfirmed: s.kind === 'VIP' ? hasPerm(me, 'vip.delete_confirmed') : hasPerm(me, 'schedule.edit'),
    }
  })

  // ======================= 冲突检测 =======================
  app.post('/sessions/check', { preHandler: viewPerm }, async (req) => {
    const b = parse(
      z.object({
        items: z
          .array(
            z.object({
              roomId: zId.optional().nullable(),
              teacherId: zId.optional().nullable(),
              vipPackageId: zId.optional().nullable(),
              startAt: z.coerce.date(),
              endAt: z.coerce.date(),
              excludeId: zId.optional().nullable(),
            }),
          )
          .min(1)
          .max(BATCH_LIMIT),
      }),
      req.body,
    )
    b.items.forEach((i) => assertRange(i.startAt, i.endAt))
    return findConflicts(prisma, b.items as ConflictQuery[])
  })

  // ======================= 单个新建 =======================
  app.post('/sessions', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const b = parse(zSessionBase.extend({ startAt: z.coerce.date(), endAt: z.coerce.date() }), req.body)
    assertRange(b.startAt, b.endAt)
    const s = await prisma.$transaction(async (tx) => {
      const r = await resolveInput(tx, me, b, durationHours(b.startAt, b.endAt))
      const [conflicts] = await findConflicts(tx, [{ roomId: r.roomId, teacherId: r.teacherId, vipPackageId: r.vipPackageId, startAt: b.startAt, endAt: b.endAt }])
      if (conflicts.length && !canForce(me, b.force)) throw conflict('时间冲突', conflicts)
      const { tz: _tz, ...data } = r
      const created = await tx.session.create({ data: { ...data, startAt: b.startAt, endAt: b.endAt, createdById: me.id } })
      if (r.vipPackageId) await reserveHours(tx, r.vipPackageId, r.hours)
      return { created, forced: conflicts.length > 0 }
    })
    await audit(req, 'create', 'Session', s.created.id, { kind: s.created.kind, title: s.created.title, startAt: s.created.startAt, hours: s.created.hours, forced: s.forced || undefined })
    return s.created
  })

  // ======================= 批量排课 =======================
  app.post('/sessions/batch/preview', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const b = parse(zBatch, req.body)
    const { items } = await expandBatch(prisma, me, b)
    return items
  })

  app.post('/sessions/batch', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const b = parse(zBatch, req.body)
    const result = await prisma.$transaction(
      async (tx) => {
        const { r, items } = await expandBatch(tx, me, b)
        const bad = items.filter((i) => i.conflicts.length)
        if (bad.length && !b.skipConflicts && !canForce(me, b.force)) {
          throw conflict(`有 ${bad.length} 个日期存在时间冲突`, bad.map((i) => ({ date: i.date, weekday: i.weekday, conflicts: i.conflicts })))
        }
        const ok = b.skipConflicts ? items.filter((i) => !i.conflicts.length) : items
        if (!ok.length) throw badRequest('全部日期都有冲突，没有可创建的课次')
        const series = await tx.sessionSeries.create({
          data: {
            startDate: b.startDate, endDate: b.endDate, weekdays: [...new Set(b.weekdays)].sort().join(','),
            startTime: b.startTime, endTime: b.endTime, timezone: r.tz, createdById: me.id,
          },
        })
        const { tz: _tz, ...data } = r
        await tx.session.createMany({
          data: ok.map((i) => ({ ...data, seriesId: series.id, startAt: i.startAt, endAt: i.endAt, createdById: me.id })),
        })
        if (r.vipPackageId) await reserveHours(tx, r.vipPackageId, round2(r.hours * ok.length))
        return {
          seriesId: series.id,
          created: ok.length,
          totalHours: round2(r.hours * ok.length),
          skipped: b.skipConflicts ? items.filter((i) => i.conflicts.length).map((i) => ({ date: i.date, weekday: i.weekday, conflicts: i.conflicts })) : [],
        }
      },
      { timeout: 30_000 },
    )
    await audit(req, 'batchCreate', 'SessionSeries', result.seriesId, { kind: b.kind, created: result.created, skipped: result.skipped.length, totalHours: result.totalHours })
    return result
  })

  // ======================= 修改 =======================
  app.put('/sessions/:id', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(
      z.object({
        title: z.string().trim().min(1, '标题不能为空').max(100).optional(),
        roomId: zId.nullable().optional(),
        teacherId: zId.nullable().optional(),
        date: z.string().regex(zYmd).optional(),
        startTime: z.string().regex(zHHmm).optional(),
        endTime: z.string().regex(zHHmm).optional(),
        hours: zHours.optional(),
        note: z.string().trim().max(1000).nullable().optional(),
        scope: zScope,
        force: z.boolean().optional(),
      }),
      req.body,
    )
    if (b.teacherId !== undefined && isOwnOnly(me) && b.teacherId !== me.id) throw forbidden('教师只能把课次安排给自己')

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.session.findUnique({ where: { id } })
      if (!target) throw notFound('课次不存在')
      if (!canEditSession(me, target)) throw forbidden('只能修改自己的课次')
      if (target.status === 'CANCELLED') throw badRequest('已取消的课次不能修改')

      // ---- 已确认：只允许改备注；VIP 课时修正需 vip.delete_confirmed ----
      if (target.status === 'CONFIRMED') {
        const tz = await campusTz(tx, target.campusId)
        const st = localParts(target.startAt, tz), et = localParts(target.endAt, tz)
        const changed =
          (b.title !== undefined && b.title !== target.title) ||
          (b.roomId !== undefined && b.roomId !== target.roomId) ||
          (b.teacherId !== undefined && b.teacherId !== target.teacherId) ||
          (b.date !== undefined && b.date !== st.date) ||
          (b.startTime !== undefined && b.startTime !== st.time) ||
          (b.endTime !== undefined && b.endTime !== et.time)
        if (changed) throw badRequest('已确认的课次只能修改备注')
        const hoursChanged = b.hours !== undefined && Math.abs(b.hours - target.hours) > 1e-6
        if (hoursChanged) {
          if (target.kind !== 'VIP') throw badRequest('已确认的课次只能修改备注')
          if (!hasPerm(me, 'vip.delete_confirmed')) throw forbidden('修改已确认 VIP 课次的课时需要「删除已确认的 VIP 课次」权限')
        }
        await tx.session.update({ where: { id }, data: { note: b.note === undefined ? undefined : b.note || null, hours: hoursChanged ? round2(b.hours!) : undefined } })
        if (hoursChanged && target.vipPackageId) await adjustHours(tx, target.vipPackageId, round2(b.hours! - target.hours), 'used')
        return { updated: 1, skipped: 0, hoursDelta: hoursChanged ? round2(b.hours! - target.hours) : 0 }
      }

      // ---- 待确认：可改全部字段 ----
      const scope = target.seriesId ? b.scope : 'one'
      if (scope !== 'one' && b.date) throw badRequest('批量修改只能修改时刻，不能修改日期（请选择「仅本次」）')
      const all = (await seriesTargets(tx, target, scope)) ?? [target]
      const targets = all.filter((t) => canEditSession(me, t))
      if (!targets.some((t) => t.id === target.id) && scope === 'one') throw forbidden()

      let newRoom: { id: number; campusId: number; allowVip: boolean; name: string } | null = null
      if (b.roomId) {
        const room = await tx.room.findUnique({ where: { id: b.roomId } })
        if (!room || !room.active) throw badRequest('教室不存在或已停用')
        newRoom = room
      }
      if (b.teacherId) {
        const t = await tx.user.findFirst({ where: { id: b.teacherId, deletedAt: null }, select: { id: true } })
        if (!t) throw badRequest('老师不存在')
      }

      const tzCache = new Map<number, string>()
      const tzOf = async (cid: number) => tzCache.get(cid) ?? (tzCache.set(cid, await campusTz(tx, cid)), tzCache.get(cid)!)
      const timeTouched = b.date !== undefined || b.startTime !== undefined || b.endTime !== undefined

      const plans: { t: (typeof targets)[number]; data: Prisma.SessionUncheckedUpdateInput; startAt: Date; endAt: Date; roomId: number | null; teacherId: number | null; hours: number; moved: boolean }[] = []
      for (const t of targets) {
        if (newRoom && t.kind === 'VIP' && !newRoom.allowVip) throw badRequest(`教室「${newRoom.name}」不可用于 VIP 课`)
        const campusId = newRoom ? newRoom.campusId : t.campusId
        let startAt = t.startAt, endAt = t.endAt
        if (timeTouched) {
          const tz = await tzOf(campusId)
          const s0 = localParts(t.startAt, tz), e0 = localParts(t.endAt, tz)
          const date = scope === 'one' && b.date ? b.date : s0.date
          startAt = zoned(date, b.startTime ?? s0.time, tz)
          endAt = zoned(date, b.endTime ?? e0.time, tz)
          assertRange(startAt, endAt)
        }
        const roomId = b.roomId !== undefined ? b.roomId : t.roomId
        const teacherId = b.teacherId !== undefined ? b.teacherId : t.teacherId
        const hours = t.kind === 'OTHER' ? 0 : round2(b.hours ?? t.hours)
        if (t.kind === 'VIP' && hours <= 0) throw badRequest('VIP 课时必须大于 0')
        const moved = startAt.getTime() !== t.startAt.getTime() || endAt.getTime() !== t.endAt.getTime() || roomId !== t.roomId || teacherId !== t.teacherId
        plans.push({
          t, startAt, endAt, roomId, teacherId, hours, moved,
          data: { title: b.title, roomId, teacherId, campusId, startAt, endAt, hours, note: b.note === undefined ? undefined : b.note || null },
        })
      }

      // 冲突检测：同批一起移动的课次互相排除
      const movedPlans = plans.filter((p) => p.moved)
      const excludeIds = plans.map((p) => p.t.id)
      const conflicts = await findConflicts(
        tx,
        movedPlans.map((p) => ({ roomId: p.roomId, teacherId: p.teacherId, vipPackageId: p.t.vipPackageId, startAt: p.startAt, endAt: p.endAt, excludeIds })),
      )
      const bad = movedPlans.map((p, k) => ({ sessionId: p.t.id, date: localParts(p.startAt, tzCache.get(p.t.campusId) ?? 'Asia/Tokyo').date, conflicts: conflicts[k] })).filter((x) => x.conflicts.length)
      if (bad.length && !canForce(me, b.force)) {
        throw conflict(scope === 'one' ? '时间冲突' : `有 ${bad.length} 节课次存在时间冲突`, scope === 'one' ? bad[0].conflicts : bad)
      }

      // 写入 + VIP 课时差额（全部是 SCHEDULED → pending）
      const delta = new Map<number, number>()
      for (const p of plans) {
        await tx.session.update({ where: { id: p.t.id }, data: p.data })
        if (p.t.kind === 'VIP' && p.t.vipPackageId) delta.set(p.t.vipPackageId, (delta.get(p.t.vipPackageId) ?? 0) + (p.hours - p.t.hours))
      }
      let hoursDelta = 0
      for (const [pkgId, d] of delta) {
        await adjustHours(tx, pkgId, round2(d), 'pending')
        hoursDelta += d
      }
      return { updated: plans.length, skipped: all.length - targets.length, hoursDelta: round2(hoursDelta), forced: bad.length > 0 }
    })
    const { scope: _s, force: _f, ...detail } = b
    await audit(req, 'update', 'Session', id, { scope: b.scope, ...detail, updated: result.updated, forced: result.forced || undefined })
    return result
  })

  // ======================= 取消 =======================
  app.post('/sessions/:id/cancel', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ scope: zScope, reason: z.string().trim().max(500).optional().nullable() }), req.body ?? {})
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.session.findUnique({ where: { id } })
      if (!target) throw notFound('课次不存在')
      if (!canEditSession(me, target)) throw forbidden('只能取消自己的课次')
      if (target.status === 'CANCELLED') throw badRequest('该课次已取消')

      if (target.status === 'CONFIRMED') {
        if (target.kind === 'VIP' && !hasPerm(me, 'vip.delete_confirmed')) throw forbidden('删除已确认的 VIP 课次需要相应权限')
        if (target.kind !== 'VIP' && !hasPerm(me, 'schedule.edit')) throw forbidden('取消已确认的课次需要教务权限')
        if (!(await cancelSession(tx, id, 'CONFIRMED', b.reason))) throw conflict('课次状态已变化，请刷新后重试')
        return { cancelled: 1, skipped: 0, ids: [id], confirmed: true, hours: target.kind === 'VIP' ? target.hours : 0 }
      }

      const scope = target.seriesId ? b.scope : 'one'
      const all = (await seriesTargets(tx, target, scope)) ?? [target]
      const targets = all.filter((t) => canEditSession(me, t))
      const ids: number[] = []
      let hours = 0
      for (const t of targets) {
        if (await cancelSession(tx, t.id, 'SCHEDULED', b.reason)) {
          ids.push(t.id)
          if (t.kind === 'VIP') hours += t.hours
        }
      }
      if (!ids.length) throw conflict('课次状态已变化，请刷新后重试')
      return { cancelled: ids.length, skipped: all.length - ids.length, ids, confirmed: false, hours: round2(hours) }
    })
    await audit(req, result.confirmed ? 'deleteConfirmed' : 'cancel', 'Session', id, { scope: b.scope, reason: b.reason, cancelled: result.cancelled, ids: result.ids, releasedHours: result.hours })
    return { cancelled: result.cancelled, skipped: result.skipped, releasedHours: result.hours }
  })

  // ======================= 确认 =======================
  app.post('/sessions/:id/confirm', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    await prisma.$transaction(async (tx) => {
      const s = await tx.session.findUnique({ where: { id } })
      if (!s) throw notFound('课次不存在')
      if (!canEditSession(me, s)) throw forbidden('只能确认自己的课次')
      if (s.status !== 'SCHEDULED') throw badRequest(s.status === 'CONFIRMED' ? '该课次已确认' : '已取消的课次不能确认')
      if (!(await confirmSession(tx, id, 'STAFF'))) throw conflict('课次状态已变化，请刷新后重试')
    })
    await audit(req, 'confirm', 'Session', id)
    return { ok: true }
  })

  // ======================= 课堂记录 =======================
  app.put('/sessions/:id/record', { preHandler: editPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(
      z.object({
        content: z.string().trim().min(1, '请填写授课内容').max(5000),
        homework: z.string().trim().max(2000).optional().nullable(),
        performance: z.string().trim().max(2000).optional().nullable(),
        studentVisible: z.boolean().optional(),
      }),
      req.body,
    )
    const s = await prisma.session.findUnique({ where: { id } })
    if (!s) throw notFound('课次不存在')
    if (!canEditSession(me, s)) throw forbidden('只能填写自己课次的课堂记录')
    if (s.status === 'CANCELLED') throw badRequest('已取消的课次不能填写课堂记录')
    const data = { content: b.content, homework: b.homework || null, performance: b.performance || null, studentVisible: b.studentVisible ?? true }
    const rec = await prisma.lessonRecord.upsert({
      where: { sessionId: id },
      create: { sessionId: id, teacherId: me.id, ...data },
      update: { ...data, teacherId: me.id },
    })
    await audit(req, 'record', 'Session', id)
    return rec
  })
}

export type { ConflictInfo }
