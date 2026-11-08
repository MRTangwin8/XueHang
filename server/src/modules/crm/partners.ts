import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { pageArgs, pageQuery, paged, parse, zId, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { perm, staff } from '../../plugins/auth'
import { zFlag, zOptId } from './util'

const rate = z.coerce.number().min(0, '返点比例应在 0~100% 之间').max(1, '返点比例应在 0~100% 之间').optional().nullable()

const orgBody = z.object({
  name: z.string().trim().min(1, '请填写机构名称').max(100),
  type: zOptStr,
  campusId: zId.optional().nullable(),
  province: zOptStr,
  city: zOptStr,
  address: zOptStr,
  contactName: zOptStr,
  contactPhone: zOptStr,
  wechat: zOptStr,
  rebateRule: zOptStr,
  rebateRateClass: rate,
  rebateRateVip: rate,
  bankName: zOptStr,
  bankAccount: zOptStr,
  bankHolder: zOptStr,
  status: z.enum(['POTENTIAL', 'ACTIVE', 'PAUSED']).default('POTENTIAL'),
  signedAt: z.coerce.date().optional().nullable(),
  ownerId: zId.optional().nullable(),
  note: zOptStr,
})

export default async function (app: FastifyInstance) {
  // ================= 渠道 =================
  app.get('/channels', { preHandler: perm('crm.channel', 'crm.customer.view', 'crm.customer.all', 'crm.report') }, async (req) => {
    const q = parse(z.object({ includeInactive: zFlag }), req.query)
    const list = await prisma.channel.findMany({
      where: q.includeInactive ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { sort: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { customers: { where: { deletedAt: null } }, students: { where: { deletedAt: null } } } } },
    })
    return list.map(({ _count, ...c }) => ({ ...c, customerCount: _count.customers, studentCount: _count.students }))
  })

  const channelBody = z.object({ name: z.string().trim().min(1, '请填写渠道名称').max(50), sort: z.coerce.number().int().default(50), active: z.boolean().optional() })

  app.post('/channels', { preHandler: perm('crm.channel') }, async (req) => {
    const body = parse(channelBody, req.body)
    const c = await prisma.channel.create({ data: body })
    await audit(req, 'create', 'Channel', c.id, body)
    return c
  })

  app.put('/channels/:id', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const body = parse(channelBody.partial(), req.body)
    const c = await prisma.channel.update({ where: { id }, data: body })
    await audit(req, 'update', 'Channel', id, body)
    return c
  })

  app.delete('/channels/:id', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await prisma.channel.update({ where: { id }, data: { active: false } })
    await audit(req, 'disable', 'Channel', id)
    return { ok: true }
  })

  // ================= 合作机构 =================
  app.get('/organizations', { preHandler: perm('crm.channel') }, async (req) => {
    const q = parse(
      pageQuery.extend({ q: z.string().trim().optional(), status: z.string().optional(), type: z.string().optional(), ownerId: zOptId, campusId: zOptId, deleted: zFlag }),
      req.query,
    )
    const where: Prisma.OrganizationWhereInput = { deletedAt: q.deleted ? { not: null } : null }
    if (q.q) where.OR = [{ name: { contains: q.q } }, { contactName: { contains: q.q } }, { contactPhone: { contains: q.q } }, { city: { contains: q.q } }]
    if (q.status) where.status = q.status
    if (q.type) where.type = q.type
    if (q.ownerId) where.ownerId = q.ownerId
    if (q.campusId) where.campusId = q.campusId
    const [items, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        ...pageArgs(q),
        orderBy: { id: 'desc' },
        include: {
          owner: { select: { id: true, name: true } },
          campus: { select: { id: true, name: true } },
          _count: { select: { customers: { where: { deletedAt: null } }, students: { where: { deletedAt: null } }, followUps: true } },
        },
      }),
      prisma.organization.count({ where }),
    ])
    const ids = items.map((o) => o.id)
    const lastFollows = ids.length
      ? await prisma.orgFollowUp.groupBy({ by: ['organizationId'], where: { organizationId: { in: ids } }, _max: { followAt: true } })
      : []
    const lastMap = new Map(lastFollows.map((r) => [r.organizationId, r._max.followAt]))
    return paged(
      items.map(({ _count, ...o }) => ({
        ...o,
        customerCount: _count.customers,
        studentCount: _count.students,
        followCount: _count.followUps,
        lastFollowAt: lastMap.get(o.id) ?? null,
      })),
      total,
      q,
    )
  })

  app.get('/organizations/:id', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const o = await prisma.organization.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        campus: { select: { id: true, name: true } },
        followUps: { orderBy: { followAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
        _count: { select: { customers: { where: { deletedAt: null } }, students: { where: { deletedAt: null } } } },
      },
    })
    if (!o) throw notFound('机构不存在')
    const [customers, students] = await Promise.all([
      prisma.customer.findMany({
        where: { organizationId: id, deletedAt: null },
        orderBy: { id: 'desc' },
        take: 20,
        select: { id: true, name: true, status: true, intentLevel: true, owner: { select: { name: true } }, createdAt: true },
      }),
      prisma.student.findMany({
        where: { organizationId: id, deletedAt: null },
        orderBy: { id: 'desc' },
        take: 20,
        select: { id: true, name: true, studentNo: true, status: true },
      }),
    ])
    const { _count, ...rest } = o
    return { ...rest, customerCount: _count.customers, studentCount: _count.students, customers, students }
  })

  app.post('/organizations', { preHandler: perm('crm.channel') }, async (req) => {
    const me = staff(req)
    const body = parse(orgBody, req.body)
    const o = await prisma.organization.create({ data: { ...body, campusId: body.campusId ?? me.campusId, ownerId: body.ownerId ?? me.id } })
    await audit(req, 'create', 'Organization', o.id, { name: o.name })
    return o
  })

  app.put('/organizations/:id', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.organization.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('机构不存在')
    const body = parse(orgBody.partial(), req.body)
    const o = await prisma.organization.update({ where: { id }, data: body })
    await audit(req, 'update', 'Organization', id, body)
    return o
  })

  app.delete('/organizations/:id', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.organization.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (!r.count) throw notFound('机构不存在')
    await audit(req, 'delete', 'Organization', id)
    return { ok: true }
  })

  app.post('/organizations/:id/restore', { preHandler: perm('crm.channel') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await prisma.organization.update({ where: { id }, data: { deletedAt: null } })
    await audit(req, 'restore', 'Organization', id)
    return { ok: true }
  })

  app.post('/organizations/:id/follow-ups', { preHandler: perm('crm.channel') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(
      z.object({
        method: z.string().trim().min(1, '请选择跟进方式'),
        content: z.string().trim().min(1, '请填写跟进内容').max(2000),
        followAt: z.coerce.date().optional().nullable(),
      }),
      req.body,
    )
    const o = await prisma.organization.findFirst({ where: { id, deletedAt: null } })
    if (!o) throw notFound('机构不存在')
    if (body.followAt && body.followAt.getTime() > Date.now() + 60_000) throw badRequest('跟进时间不能晚于现在')
    const f = await prisma.orgFollowUp.create({
      data: { organizationId: id, userId: me.id, method: body.method, content: body.content, followAt: body.followAt ?? new Date() },
      include: { user: { select: { id: true, name: true } } },
    })
    await audit(req, 'follow', 'Organization', id, { followUpId: f.id })
    return f
  })
}
