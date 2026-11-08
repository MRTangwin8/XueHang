import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { perm } from '../../plugins/auth'
import { audit } from '../../lib/audit'

const P = perm('system.campus')

const campusBody = z.object({
  code: z.string().trim().min(1, '请填写校区代码').max(20),
  name: z.string().trim().min(1, '请填写校区名称').max(50),
  address: zOptStr,
  timezone: z.string().trim().min(1).default('Asia/Tokyo'),
  sort: z.coerce.number().int().default(50),
})

function checkTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw badRequest(`无效的时区：${tz}`)
  }
}

export default async function campusRoutes(app: FastifyInstance) {
  app.get('/campuses', { preHandler: P }, async (req) => {
    const q = parse(z.object({ deleted: z.string().optional() }), req.query)
    const deleted = q.deleted === '1' || q.deleted === 'true'
    const list = await prisma.campus.findMany({
      where: { deletedAt: deleted ? { not: null } : null },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { users: { where: { deletedAt: null } }, rooms: true, students: { where: { deletedAt: null } } } } },
    })
    return list.map(({ _count, ...c }) => ({ ...c, userCount: _count.users, roomCount: _count.rooms, studentCount: _count.students }))
  })

  app.post('/campuses', { preHandler: P }, async (req) => {
    const body = parse(campusBody, req.body)
    checkTz(body.timezone)
    if (await prisma.campus.findUnique({ where: { code: body.code } })) throw conflict('校区代码已存在（可能在已删除列表中）')
    const c = await prisma.campus.create({ data: body })
    await audit(req, 'create', 'Campus', c.id, body)
    return c
  })

  app.put('/campuses/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const body = parse(campusBody, req.body)
    checkTz(body.timezone)
    const old = await prisma.campus.findUnique({ where: { id } })
    if (!old) throw notFound('校区不存在')
    const dup = await prisma.campus.findFirst({ where: { code: body.code, id: { not: id } } })
    if (dup) throw conflict('校区代码已存在')
    const c = await prisma.campus.update({ where: { id }, data: body })
    await audit(req, 'update', 'Campus', id, body)
    return c
  })

  app.delete('/campuses/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.campus.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('校区不存在或已删除')
    const left = await prisma.campus.count({ where: { deletedAt: null, id: { not: id } } })
    if (left === 0) throw badRequest('至少保留一个校区')
    await prisma.campus.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'Campus', id, { name: old.name })
    return { ok: true }
  })

  app.post('/campuses/:id/restore', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.campus.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!old) throw notFound('校区不存在或未删除')
    await prisma.campus.update({ where: { id }, data: { deletedAt: null } })
    await audit(req, 'restore', 'Campus', id, { name: old.name })
    return { ok: true }
  })
}
