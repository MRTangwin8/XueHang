/** VIP 班级（课时包） */
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zId, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, notFound } from '../../lib/errors'
import { assertCampus, campusLimit, hasPerm, perm, staff, type StaffPrincipal } from '../../plugins/auth'
import type { FastifyRequest } from 'fastify'
import { audit } from '../../lib/audit'
import { remainingOf, round2 } from './service'
import { presentSession, sessionInclude } from './routes-sessions'

/** 有 vip.manage 看全部；只有 schedule.own 的老师只看自己任教的包 */
/** vip.manage：数据范围内（按学员校区）的课时包；否则只看自己任课的 */
function vipScope(me: StaffPrincipal): Prisma.VipPackageWhereInput {
  if (!hasPerm(me, 'vip.manage')) return { teachers: { some: { teacherId: me.id } } }
  const lim = campusLimit(me)
  return lim == null ? {} : { OR: [{ student: { campusId: { in: lim } } }, { teachers: { some: { teacherId: me.id } } }] }
}

/** 取课时包并校验校区（按学员所属校区） */
async function ownPkg(req: FastifyRequest, id: number, deleted = false) {
  const p = await prisma.vipPackage.findFirst({ where: { id, deletedAt: deleted ? { not: null } : null }, include: { student: { select: { campusId: true } } } })
  if (!p) throw notFound(deleted ? '课时包不存在或未删除' : 'VIP 课时包不存在')
  assertCampus(staff(req), p.student.campusId)
  return p
}

const pkgInclude = {
  student: { select: { id: true, name: true, studentNo: true, campusId: true, campus: { select: { id: true, name: true } } } },
  teachers: { include: { teacher: { select: { id: true, name: true } } } },
  order: { select: { id: true, orderNo: true } },
} satisfies Prisma.VipPackageInclude
type PkgRow = Prisma.VipPackageGetPayload<{ include: typeof pkgInclude }>

function presentPkg(p: PkgRow) {
  const { teachers, ...rest } = p
  return { ...rest, teachers: teachers.map((t) => t.teacher), remaining: remainingOf(p) }
}

const zPkg = z.object({
  studentId: zId,
  orderId: zId.nullable().optional(),
  name: z.string().trim().min(1, '请填写课时包名称').max(100),
  subject: zOptStr,
  totalHours: z.coerce.number().positive('总课时必须大于 0').max(10000),
  teacherIds: z.array(zId).min(1, '请至少选择一位任课老师'),
  expireAt: z.coerce.date().nullable().optional(),
  note: zOptStr,
})

export default async function (app: FastifyInstance) {
  const viewPerm = perm('vip.manage', 'schedule.own')

  app.get('/vip', { preHandler: viewPerm }, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({ status: z.string().optional(), q: z.string().trim().optional(), teacherId: zId.optional(), campusId: zId.optional(), studentId: zId.optional() }),
      req.query,
    )
    const and: Prisma.VipPackageWhereInput[] = [{ deletedAt: null }, vipScope(me)]
    if (q.status) and.push({ status: q.status })
    if (q.studentId) and.push({ studentId: q.studentId })
    if (q.teacherId) and.push({ teachers: { some: { teacherId: q.teacherId } } })
    if (q.campusId) and.push({ student: { campusId: q.campusId } })
    if (q.q) and.push({ OR: [{ name: { contains: q.q } }, { subject: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }] })
    const where: Prisma.VipPackageWhereInput = { AND: and }
    const [rows, total] = await Promise.all([
      // 未结业（ACTIVE）优先，再按 id 倒序
      prisma.vipPackage.findMany({ where, ...pageArgs(q), orderBy: [{ status: 'asc' }, { id: 'desc' }], include: pkgInclude }),
      prisma.vipPackage.count({ where }),
    ])
    const ids = rows.map((r) => r.id)
    const [upcoming, counts] = await Promise.all([
      prisma.session.findMany({
        where: { vipPackageId: { in: ids }, status: 'SCHEDULED', startAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
        select: { id: true, vipPackageId: true, startAt: true, endAt: true, room: { select: { name: true } }, teacher: { select: { name: true } } },
      }),
      prisma.session.groupBy({ by: ['vipPackageId', 'status'], where: { vipPackageId: { in: ids } }, _count: true }),
    ])
    const items = rows.map((r) => ({
      ...presentPkg(r),
      nextSession: upcoming.find((s) => s.vipPackageId === r.id) ?? null,
      sessionCounts: Object.fromEntries(counts.filter((c) => c.vipPackageId === r.id).map((c) => [c.status, c._count])),
    }))
    return paged(items, total, q)
  })

  /** 约课下拉：可约的（在读）课时包 + 剩余课时 */
  app.get('/vip/options', { preHandler: perm('vip.manage', 'schedule.own', 'schedule.edit') }, async (req) => {
    const me = staff(req)
    const q = parse(z.object({ q: z.string().trim().optional(), campusId: zId.optional(), ids: z.string().optional() }), req.query)
    const and: Prisma.VipPackageWhereInput[] = [{ deletedAt: null }]
    if (!hasPerm(me, 'schedule.edit')) and.push(vipScope(me))
    if (q.ids) and.push({ id: { in: q.ids.split(',').map(Number).filter(Boolean) } })
    else and.push({ status: 'ACTIVE' })
    if (q.campusId) and.push({ student: { campusId: q.campusId } })
    if (q.q) and.push({ OR: [{ name: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }] })
    const rows = await prisma.vipPackage.findMany({ where: { AND: and }, include: pkgInclude, orderBy: { id: 'desc' }, take: 100 })
    return rows.map(presentPkg)
  })

  app.get('/vip/:id', { preHandler: viewPerm }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const p = await prisma.vipPackage.findFirst({ where: { AND: [{ id, deletedAt: null }, vipScope(me)] }, include: pkgInclude })
    if (!p) throw notFound('VIP 课时包不存在')
    const sessions = await prisma.session.findMany({ where: { vipPackageId: id }, include: sessionInclude, orderBy: { startAt: 'desc' } })
    return { ...presentPkg(p), sessions: sessions.map((s) => presentSession(s, me)) }
  })

  async function validateRefs(b: { studentId?: number; orderId?: number | null; teacherIds?: number[] }, studentId?: number) {
    if (b.studentId && !(await prisma.student.findFirst({ where: { id: b.studentId, deletedAt: null } }))) throw badRequest('学员不存在')
    if (b.orderId) {
      const o = await prisma.order.findUnique({ where: { id: b.orderId }, select: { studentId: true } })
      if (!o) throw badRequest('订单不存在')
      if (o.studentId !== (b.studentId ?? studentId)) throw badRequest('订单不属于该学员')
    }
    if (b.teacherIds?.length) {
      const n = await prisma.user.count({ where: { id: { in: b.teacherIds }, deletedAt: null } })
      if (n !== new Set(b.teacherIds).size) throw badRequest('任课老师不存在')
    }
  }

  app.post('/vip', { preHandler: perm('vip.manage') }, async (req) => {
    const { teacherIds, ...b } = parse(zPkg, req.body)
    await validateRefs({ ...b, teacherIds })
    const stu = await prisma.student.findUniqueOrThrow({ where: { id: b.studentId }, select: { campusId: true } })
    assertCampus(staff(req), stu.campusId)
    const p = await prisma.vipPackage.create({
      data: { ...b, totalHours: round2(b.totalHours), teachers: { create: [...new Set(teacherIds)].map((teacherId) => ({ teacherId })) } },
    })
    await audit(req, 'create', 'VipPackage', p.id, { name: p.name, studentId: p.studentId, totalHours: p.totalHours })
    return p
  })

  app.put('/vip/:id', { preHandler: perm('vip.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const { teacherIds, studentId: _sid, ...b } = parse(zPkg.partial(), req.body)
    await ownPkg(req, id)
    const p = await prisma.$transaction(async (tx) => {
      const cur = await tx.vipPackage.findFirst({ where: { id, deletedAt: null } })
      if (!cur) throw notFound('VIP 课时包不存在')
      await validateRefs({ orderId: b.orderId, teacherIds }, cur.studentId)
      if (b.totalHours !== undefined) {
        const min = round2(cur.usedHours + cur.pendingHours)
        if (b.totalHours + 1e-6 < min) throw badRequest(`总课时不能小于已确认 + 待确认（${min}h）`)
      }
      const updated = await tx.vipPackage.update({ where: { id }, data: { ...b, totalHours: b.totalHours === undefined ? undefined : round2(b.totalHours) } })
      if (teacherIds) {
        await tx.vipPackageTeacher.deleteMany({ where: { vipPackageId: id } })
        await tx.vipPackageTeacher.createMany({ data: [...new Set(teacherIds)].map((teacherId) => ({ vipPackageId: id, teacherId })) })
      }
      return updated
    })
    await audit(req, 'update', 'VipPackage', id, { ...b, teacherIds })
    return p
  })

  for (const [action, status] of [['finish', 'FINISHED'], ['reopen', 'ACTIVE']] as const) {
    app.post(`/vip/:id/${action}`, { preHandler: perm('vip.manage') }, async (req) => {
      const { id } = parse(zIdParam, req.params)
      await ownPkg(req, id)
      const r = await prisma.vipPackage.updateMany({ where: { id, deletedAt: null }, data: { status } })
      if (!r.count) throw notFound('VIP 课时包不存在')
      await audit(req, action, 'VipPackage', id)
      return { ok: true }
    })
  }

  app.delete('/vip/:id', { preHandler: perm('vip.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const cur = await ownPkg(req, id)
    const live = await prisma.session.count({ where: { vipPackageId: id, status: { not: 'CANCELLED' } } })
    if (live) throw badRequest(`该课时包还有 ${live} 节未取消的课次，不能删除`)
    await prisma.vipPackage.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'VipPackage', id, { name: cur.name })
    return { ok: true }
  })

  app.post('/vip/:id/restore', { preHandler: perm('vip.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await ownPkg(req, id, true)
    const r = await prisma.vipPackage.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } })
    if (!r.count) throw notFound('课时包不存在或未删除')
    await audit(req, 'restore', 'VipPackage', id)
    return { ok: true }
  })

}
