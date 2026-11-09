/** 教室 / 班课 */
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zId, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { assertCampus, hasPerm, perm, staff } from '../../plugins/auth'
import type { FastifyRequest } from 'fastify'
import { audit } from '../../lib/audit'

const zBool = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1')

export default async function (app: FastifyInstance) {
  // ======================= 教室 =======================
  const zRoom = z.object({
    campusId: zId,
    name: z.string().trim().min(1, '请填写教室名称').max(50),
    building: zOptStr,
    capacity: z.coerce.number().int().min(1).max(1000).default(1),
    kind: z.enum(['CLASS', 'VIP', 'ONLINE', 'STUDIO']).default('CLASS'),
    allowVip: z.boolean().default(true),
    sort: z.coerce.number().int().default(50),
    active: z.boolean().optional(),
    note: zOptStr,
  })

  app.get('/rooms', { preHandler: perm('schedule.view', 'schedule.own', 'room.manage') }, async (req) => {
    const q = parse(z.object({ campusId: zId.optional(), includeInactive: zBool.optional() }), req.query)
    return prisma.room.findMany({
      where: { ...(q.campusId ? { campusId: q.campusId } : {}), ...(q.includeInactive ? {} : { active: true }) },
      include: { campus: { select: { id: true, name: true } } },
      orderBy: [{ campusId: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
    })
  })

  app.post('/rooms', { preHandler: perm('room.manage') }, async (req) => {
    const b = parse(zRoom, req.body)
    const room = await prisma.room.create({ data: { ...b, active: b.active ?? true } })
    await audit(req, 'create', 'Room', room.id, { name: room.name })
    return room
  })

  app.put('/rooms/:id', { preHandler: perm('room.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(zRoom.partial(), req.body)
    if (!(await prisma.room.findUnique({ where: { id } }))) throw notFound('教室不存在')
    const room = await prisma.room.update({ where: { id }, data: b })
    await audit(req, 'update', 'Room', id, b)
    return room
  })

  /** 停用（保留历史课次） */
  app.delete('/rooms/:id', { preHandler: perm('room.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.room.updateMany({ where: { id }, data: { active: false } })
    if (!r.count) throw notFound('教室不存在')
    await audit(req, 'disable', 'Room', id)
    return { ok: true }
  })

  app.post('/rooms/:id/restore', { preHandler: perm('room.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.room.updateMany({ where: { id }, data: { active: true } })
    if (!r.count) throw notFound('教室不存在')
    await audit(req, 'restore', 'Room', id)
    return { ok: true }
  })

  // ======================= 班课 =======================
  const zClass = z.object({
    campusId: zId,
    name: z.string().trim().min(1, '请填写班级名称').max(100),
    subject: zOptStr,
    productId: zId.nullable().optional(),
    teacherId: zId.nullable().optional(),
    defaultRoomId: zId.nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    color: zOptStr,
    note: zOptStr,
    studentIds: z.array(zId).optional(),
  })

  const classView = perm('class.manage', 'schedule.view', 'schedule.own')

  app.get('/classes', { preHandler: classView }, async (req) => {
    const q = parse(pageQuery.extend({ campusId: zId.optional(), status: z.string().optional(), q: z.string().trim().optional(), teacherId: zId.optional() }), req.query)
    const where: Prisma.ClassGroupWhereInput = { deletedAt: null }
    if (q.campusId) where.campusId = q.campusId
    if (q.status) where.status = q.status
    if (q.teacherId) where.teacherId = q.teacherId
    if (q.q) where.OR = [{ name: { contains: q.q } }, { subject: { contains: q.q } }]
    const [rows, total] = await Promise.all([
      prisma.classGroup.findMany({
        where,
        ...pageArgs(q),
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        include: {
          campus: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          _count: { select: { students: true, sessions: { where: { status: { not: 'CANCELLED' } } } } },
        },
      }),
      prisma.classGroup.count({ where }),
    ])
    const roomIds = [...new Set(rows.map((r) => r.defaultRoomId).filter((v): v is number => !!v))]
    const rooms = roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }) : []
    const items = rows.map(({ _count, ...r }) => ({
      ...r,
      defaultRoom: rooms.find((x) => x.id === r.defaultRoomId) ?? null,
      studentCount: _count.students,
      sessionCount: _count.sessions,
    }))
    return paged(items, total, q)
  })

  app.get('/classes/:id', { preHandler: classView }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const c = await prisma.classGroup.findFirst({
      where: { id, deletedAt: null },
      include: {
        campus: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        students: { include: { student: { select: { id: true, name: true, studentNo: true, status: true, phone: true } } }, orderBy: { joinedAt: 'asc' } },
      },
    })
    if (!c) throw notFound('班课不存在')
    // 访问控制：管理者限本校区（数据范围 ALL 除外）；普通教师只能看自己任课的班课；学生电话只给管理者
    const me = staff(req)
    const manager = hasPerm(me, 'class.manage') || hasPerm(me, 'schedule.edit')
    if (manager) {
      if (!hasPerm(me, '*') && me.dataScope !== 'ALL' && me.campusId && c.campusId !== me.campusId) throw forbidden('无权查看其他校区的班课')
    } else if (c.teacherId !== me.id) {
      const teaches = await prisma.session.count({ where: { classGroupId: id, teacherId: me.id } })
      if (!teaches) throw forbidden('只能查看自己任课的班课')
    }
    if (!manager) c.students.forEach((s) => (s.student.phone = null))
    const [defaultRoom, sessionStats, next] = await Promise.all([
      c.defaultRoomId ? prisma.room.findUnique({ where: { id: c.defaultRoomId }, select: { id: true, name: true } }) : null,
      prisma.session.groupBy({ by: ['status'], where: { classGroupId: id }, _count: true }),
      prisma.session.findFirst({ where: { classGroupId: id, status: 'SCHEDULED', startAt: { gte: new Date() } }, orderBy: { startAt: 'asc' }, include: { room: { select: { name: true } } } }),
    ])
    return {
      ...c,
      defaultRoom,
      students: c.students.map((s) => ({ ...s.student, joinedAt: s.joinedAt })),
      sessionStats: Object.fromEntries(sessionStats.map((g) => [g.status, g._count])),
      nextSession: next,
    }
  })

  async function validateClassRefs(b: { campusId?: number; teacherId?: number | null; defaultRoomId?: number | null }) {
    if (b.defaultRoomId) {
      const r = await prisma.room.findUnique({ where: { id: b.defaultRoomId } })
      if (!r) throw badRequest('默认教室不存在')
      if (b.campusId && r.campusId !== b.campusId) throw badRequest('默认教室不属于所选校区')
    }
    if (b.teacherId && !(await prisma.user.findFirst({ where: { id: b.teacherId, deletedAt: null } }))) throw badRequest('任课老师不存在')
  }

  /** 取班课并校验校区：数据范围不是「全部」的账号只能管理本校区的班课 */
  async function ownClass(req: FastifyRequest, id: number, deleted = false) {
    const c = await prisma.classGroup.findFirst({ where: { id, deletedAt: deleted ? { not: null } : null } })
    if (!c) throw notFound(deleted ? '班课不存在或未删除' : '班课不存在')
    assertCampus(staff(req), c.campusId)
    return c
  }

  app.post('/classes', { preHandler: perm('class.manage') }, async (req) => {
    const { studentIds, ...b } = parse(zClass, req.body)
    assertCampus(staff(req), b.campusId)
    await validateClassRefs(b)
    const c = await prisma.classGroup.create({
      data: { ...b, students: studentIds?.length ? { create: [...new Set(studentIds)].map((studentId) => ({ studentId })) } : undefined },
    })
    await audit(req, 'create', 'ClassGroup', c.id, { name: c.name })
    return c
  })

  app.put('/classes/:id', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const { studentIds: _ignored, ...b } = parse(zClass.partial(), req.body)
    const cur = await ownClass(req, id)
    if (b.campusId !== undefined) assertCampus(staff(req), b.campusId)
    await validateClassRefs({ ...b, campusId: b.campusId ?? cur.campusId })
    const c = await prisma.classGroup.update({ where: { id }, data: b })
    await audit(req, 'update', 'ClassGroup', id, b)
    return c
  })

  app.delete('/classes/:id', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const cur = await ownClass(req, id)
    const future = await prisma.session.count({ where: { classGroupId: id, status: 'SCHEDULED', startAt: { gte: new Date() } } })
    if (future) throw badRequest(`该班还有 ${future} 节未上的课次，请先取消后再删除`)
    await prisma.classGroup.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'ClassGroup', id, { name: cur.name })
    return { ok: true }
  })

  app.post('/classes/:id/restore', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await ownClass(req, id, true)
    const r = await prisma.classGroup.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } })
    if (!r.count) throw notFound('班课不存在或未删除')
    await audit(req, 'restore', 'ClassGroup', id)
    return { ok: true }
  })

  app.post('/classes/:id/students', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const { studentIds } = parse(z.object({ studentIds: z.array(zId).min(1, '请选择学员') }), req.body)
    await ownClass(req, id)
    const exists = await prisma.classGroupStudent.findMany({ where: { classGroupId: id, studentId: { in: studentIds } }, select: { studentId: true } })
    const have = new Set(exists.map((e) => e.studentId))
    const add = [...new Set(studentIds)].filter((s) => !have.has(s))
    const valid = await prisma.student.findMany({ where: { id: { in: add }, deletedAt: null }, select: { id: true } })
    if (valid.length) await prisma.classGroupStudent.createMany({ data: valid.map((s) => ({ classGroupId: id, studentId: s.id })) })
    await audit(req, 'addStudents', 'ClassGroup', id, { studentIds: valid.map((v) => v.id) })
    return { added: valid.length }
  })

  app.delete('/classes/:id/students/:studentId', { preHandler: perm('class.manage') }, async (req) => {
    const { id, studentId } = parse(z.object({ id: zId, studentId: zId }), req.params)
    await ownClass(req, id)
    const r = await prisma.classGroupStudent.deleteMany({ where: { classGroupId: id, studentId } })
    if (!r.count) throw notFound('该学员不在班级中')
    await audit(req, 'removeStudent', 'ClassGroup', id, { studentId })
    return { ok: true }
  })

  app.post('/classes/:id/finish', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await ownClass(req, id)
    const r = await prisma.classGroup.updateMany({ where: { id, deletedAt: null }, data: { status: 'FINISHED' } })
    if (!r.count) throw notFound('班课不存在')
    await audit(req, 'finish', 'ClassGroup', id)
    return { ok: true }
  })

  app.post('/classes/:id/reopen', { preHandler: perm('class.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await ownClass(req, id)
    const r = await prisma.classGroup.updateMany({ where: { id, deletedAt: null }, data: { status: 'ACTIVE' } })
    if (!r.count) throw notFound('班课不存在')
    await audit(req, 'reopen', 'ClassGroup', id)
    return { ok: true }
  })
}
