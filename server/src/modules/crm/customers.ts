import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { pageArgs, pageQuery, paged, parse, zId, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyUser } from '../../lib/notify'
import { dayjs, DEFAULT_TZ } from '../../lib/time'
import { perm, scopeWhere, staff } from '../../plugins/auth'
import { campusLimit, can, canViewCustomer, dayRange, editableCustomer, loadCustomer, zFlag, zOptDay, zOptId } from './util'

const listQuery = pageQuery.extend({
  scope: z.enum(['mine', 'pool', 'all']).default('mine'),
  q: z.string().trim().optional(),
  status: z.string().optional(),
  intentLevel: z.string().optional(),
  source: z.string().optional(),
  channelId: zOptId,
  organizationId: zOptId,
  ownerId: zOptId,
  campusId: zOptId,
  from: zOptDay,
  to: zOptDay,
  nextFollowDue: zFlag,
  deleted: zFlag,
  sort: z.enum(['id', 'lastFollowAt', 'nextFollowAt', 'createdAt']).default('id'),
})

const customerBody = z.object({
  name: z.string().trim().min(1, '请填写客户姓名').max(50),
  gender: zOptStr,
  phone: zOptStr,
  wechat: zOptStr,
  qq: zOptStr,
  email: zOptStr,
  province: zOptStr,
  city: zOptStr,
  education: zOptStr,
  currentSchool: zOptStr,
  subjectCategory: zOptStr,
  targetSchool: zOptStr,
  intentLevel: z.enum(['A', 'B', 'C', 'D']).default('C'),
  /** 「已签约」只能由学员报名流程写入；手工只能在 新客户 / 跟进中 / 已流失 之间切换（见新建 / 修改接口的校验） */
  status: z.enum(['NEW', 'FOLLOWING', 'SIGNED', 'LOST']).optional(),
  source: zOptStr,
  channelId: zId.optional().nullable(),
  organizationId: zId.optional().nullable(),
  campusId: zId.optional().nullable(),
  nextFollowAt: z.coerce.date().optional().nullable(),
  note: zOptStr,
})

const listInclude = {
  owner: { select: { id: true, name: true } },
  channel: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
  campus: { select: { id: true, name: true } },
  student: { select: { id: true, name: true, studentNo: true } },
  _count: { select: { followUps: true } },
} satisfies Prisma.CustomerInclude

export default async function (app: FastifyInstance) {
  // ---------------- 列表 ----------------
  app.get('/customers', { preHandler: perm('crm.customer.view', 'crm.pool', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const q = parse(listQuery, req.query)
    const and: Prisma.CustomerWhereInput[] = []
    if (q.scope === 'mine') {
      if (!can(me, 'crm.customer.view')) throw forbidden()
      and.push({ ownerId: me.id })
    } else if (q.scope === 'pool') {
      if (!can(me, 'crm.pool')) throw forbidden()
      and.push({ ownerId: null })
      const lim = campusLimit(me)
      if (lim) and.push({ campusId: lim })
    } else {
      if (!can(me, 'crm.customer.all')) throw forbidden()
      // 校区范围：超管 / 全部范围不限，其余限本校区
      and.push(scopeWhere(me) as Prisma.CustomerWhereInput)
      if (q.ownerId) and.push({ ownerId: q.ownerId })
    }
    if (q.deleted) {
      if (q.scope !== 'all') throw forbidden('回收站仅在「全部客户」中可用')
      and.push({ deletedAt: { not: null } })
    } else and.push({ deletedAt: null })

    if (q.q) and.push({ OR: [{ name: { contains: q.q } }, { phone: { contains: q.q } }, { wechat: { contains: q.q } }, { qq: { contains: q.q } }] })
    if (q.status) and.push({ status: q.status })
    if (q.intentLevel) and.push({ intentLevel: q.intentLevel })
    if (q.source) and.push({ source: q.source })
    if (q.channelId) and.push({ channelId: q.channelId })
    if (q.organizationId) and.push({ organizationId: q.organizationId })
    if (q.campusId) and.push({ campusId: q.campusId })
    const created = dayRange(q.from, q.to)
    if (created) and.push({ createdAt: created })
    if (q.nextFollowDue) {
      const end = dayjs().tz(DEFAULT_TZ).add(1, 'day').startOf('day').toDate()
      and.push({ nextFollowAt: { lt: end }, status: { in: ['NEW', 'FOLLOWING'] } })
    }
    const where: Prisma.CustomerWhereInput = { AND: and }
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      q.sort === 'id' ? [{ id: 'desc' }] : [{ [q.sort]: { sort: q.sort === 'nextFollowAt' ? 'asc' : 'desc', nulls: 'last' } }, { id: 'desc' }]
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, include: listInclude, orderBy, ...pageArgs(q) }),
      prisma.customer.count({ where }),
    ])
    // 兼容未同步 lastFollowAt 的历史数据：用跟进记录的最晚时间补齐
    const missing = items.filter((c) => !c.lastFollowAt && c._count.followUps).map((c) => c.id)
    const lastMap = new Map<number, Date | null>()
    if (missing.length) {
      const g = await prisma.followUp.groupBy({ by: ['customerId'], where: { customerId: { in: missing } }, _max: { createdAt: true } })
      g.forEach((r) => lastMap.set(r.customerId, r._max.createdAt))
    }
    return paged(
      items.map(({ _count, ...c }) => ({ ...c, lastFollowAt: c.lastFollowAt ?? lastMap.get(c.id) ?? null, followCount: _count.followUps })),
      total,
      q,
    )
  })

  // ---------------- 查重 ----------------
  app.get('/customers/check-duplicate', { preHandler: perm('crm.customer.view', 'crm.pool', 'crm.customer.all') }, async (req) => {
    const q = parse(z.object({ phone: z.string().trim().optional(), wechat: z.string().trim().optional(), qq: z.string().trim().optional(), excludeId: zOptId }), req.query)
    const or: Prisma.CustomerWhereInput[] = []
    if (q.phone) or.push({ phone: q.phone })
    if (q.wechat) or.push({ wechat: q.wechat })
    if (q.qq) or.push({ qq: q.qq })
    if (!or.length) return []
    const list = await prisma.customer.findMany({
      where: { deletedAt: null, OR: or, ...(q.excludeId ? { id: { not: q.excludeId } } : {}) },
      take: 10,
      orderBy: { id: 'desc' },
      select: {
        id: true, name: true, phone: true, wechat: true, qq: true, status: true, studentId: true, createdAt: true,
        owner: { select: { id: true, name: true } },
        campus: { select: { id: true, name: true } },
      },
    })
    const me = staff(req)
    return list.map((c) => {
      const matched = [
        q.phone && c.phone === q.phone ? 'phone' : null,
        q.wechat && c.wechat === q.wechat ? 'wechat' : null,
        q.qq && c.qq === q.qq ? 'qq' : null,
      ].filter(Boolean)
      // 无权查看的客户只提示「已存在」及负责人 / 校区，不返回姓名和联系方式，防止借查重接口打探他人客户
      if (!canViewCustomer(me, { id: c.id, ownerId: c.owner?.id ?? null, campusId: c.campus.id, deletedAt: null })) {
        return { id: null, name: null, phone: null, wechat: null, qq: null, status: null, studentId: null, createdAt: null, owner: c.owner, campus: c.campus, matched, restricted: true }
      }
      return { ...c, matched, restricted: false }
    })
  })

  // ---------------- 详情 ----------------
  app.get('/customers/:id', { preHandler: perm('crm.customer.view', 'crm.pool', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const c = await prisma.customer.findUnique({
      where: { id },
      include: {
        ...listInclude,
        student: { select: { id: true, name: true, studentNo: true, status: true } },
        followUps: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
      },
    })
    if (!c || (c.deletedAt && !can(me, 'crm.customer.all'))) throw notFound('客户不存在')
    if (!canViewCustomer(me, c)) throw forbidden('无权查看该客户')
    const { _count, ...rest } = c
    return {
      ...rest,
      followCount: _count.followUps,
      canEdit: c.ownerId === me.id || can(me, 'crm.customer.all'),
    }
  })

  // ---------------- 新建 ----------------
  app.post('/customers', { preHandler: perm('crm.customer.view', 'crm.pool', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const body = parse(customerBody.extend({ toPool: z.boolean().optional(), ownerId: zId.optional().nullable() }), req.body)
    const { toPool, ownerId: reqOwner, campusId: reqCampus, ...data } = body
    let ownerId: number | null = me.id
    if (toPool) ownerId = null
    else if (reqOwner && reqOwner !== me.id) {
      if (!can(me, 'crm.customer.all')) throw forbidden('只有拥有「全部客户」权限才能指定其他负责人')
      ownerId = reqOwner
    }
    if (reqCampus && reqCampus !== me.campusId && campusLimit(me) != null) throw forbidden('只能在本校区新建客户')
    if (data.status === 'SIGNED') throw forbidden('「已签约」只能通过学员报名自动设置')
    let campusId = reqCampus ?? me.campusId
    if (!campusId) campusId = (await prisma.campus.findFirst({ where: { deletedAt: null }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }))?.id ?? null
    if (!campusId) throw badRequest('请选择校区')
    const c = await prisma.customer.create({
      data: { ...data, status: data.status ?? 'NEW', campusId, ownerId, assignedAt: ownerId ? new Date() : null },
    })
    await audit(req, 'create', 'Customer', c.id, { name: c.name, toPool: !!toPool })
    if (ownerId && ownerId !== me.id) await notifyUser(ownerId, `新客户分配：${c.name}`, { link: `/crm/customers?id=${c.id}` })
    return c
  })

  // ---------------- 修改 ----------------
  app.put('/customers/:id', { preHandler: perm('crm.customer.view', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    await editableCustomer(me, id)
    const body = parse(customerBody.partial(), req.body)
    const { campusId, ...data } = body
    const old = await prisma.customer.findUniqueOrThrow({ where: { id }, select: { campusId: true, status: true } })
    if (campusId && campusId !== old.campusId && campusLimit(me) != null) throw forbidden('无权把客户转到其他校区')
    if (data.status === old.status) delete data.status
    else if (data.status === 'SIGNED') throw forbidden('「已签约」只能通过学员报名自动设置')
    else if (old.status === 'SIGNED' && data.status) throw badRequest('已签约客户的状态不能手工修改')
    const c = await prisma.customer.update({ where: { id }, data: { ...data, ...(campusId ? { campusId } : {}) } })
    await audit(req, 'update', 'Customer', id, body)
    return c
  })

  // ---------------- 删除 / 恢复 ----------------
  app.delete('/customers/:id', { preHandler: perm('crm.customer.view', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const c = await editableCustomer(me, id)
    if (c.studentId) throw conflict('该客户已转为学员，不能删除')
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'Customer', id, { name: c.name })
    return { ok: true }
  })

  app.post('/customers/:id/restore', { preHandler: perm('crm.customer.all') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const c = await loadCustomer(id, { withDeleted: true })
    if (!canViewCustomer(staff(req), c)) throw forbidden('无权恢复其他校区的客户')
    if (!c.deletedAt) return { ok: true }
    await prisma.customer.update({ where: { id }, data: { deletedAt: null } })
    await audit(req, 'restore', 'Customer', id, { name: c.name })
    return { ok: true }
  })

  // ---------------- 公海：领取 / 放入公海 / 分配 ----------------
  app.post('/customers/:id/claim', { preHandler: perm('crm.pool') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const c = await loadCustomer(id)
    if (!canViewCustomer(me, c)) throw forbidden('无权领取该客户')
    const r = await prisma.customer.updateMany({ where: { id, ownerId: null, deletedAt: null }, data: { ownerId: me.id, assignedAt: new Date() } })
    if (!r.count) throw conflict('该客户已被他人领取')
    await audit(req, 'claim', 'Customer', id, { name: c.name })
    return { ok: true }
  })

  app.post('/customers/release', { preHandler: perm('crm.customer.view', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { ids } = parse(z.object({ ids: z.array(zId).min(1, '请选择客户') }), req.body)
    const where: Prisma.CustomerWhereInput = { id: { in: ids }, deletedAt: null, ownerId: { not: null } }
    if (!can(me, 'crm.customer.all')) where.ownerId = me.id
    else {
      const lim = campusLimit(me)
      if (lim) where.OR = [{ ownerId: me.id }, { campusId: lim }]
    }
    const r = await prisma.customer.updateMany({ where, data: { ownerId: null, assignedAt: null } })
    await audit(req, 'release', 'Customer', ids.join(','), { count: r.count })
    return { count: r.count }
  })

  app.post('/customers/assign', { preHandler: perm('crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { ids, ownerId } = parse(z.object({ ids: z.array(zId).min(1, '请选择客户'), ownerId: zId }), req.body)
    const owner = await prisma.user.findFirst({ where: { id: ownerId, deletedAt: null, status: 'ACTIVE' } })
    if (!owner) throw badRequest('负责人不存在或已停用')
    const lim = campusLimit(me)
    const r = await prisma.customer.updateMany({
      where: { id: { in: ids }, deletedAt: null, ...(lim ? { campusId: lim } : {}) },
      data: { ownerId, assignedAt: new Date() },
    })
    await audit(req, 'assign', 'Customer', ids.join(','), { ownerId, owner: owner.name, count: r.count })
    if (r.count && ownerId !== me.id) await notifyUser(ownerId, `${me.name} 给你分配了 ${r.count} 位客户`, { link: '/crm/customers' })
    return { count: r.count }
  })

  // ---------------- 跟进 ----------------
  app.post('/customers/:id/follow-ups', { preHandler: perm('crm.customer.view', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const c = await editableCustomer(me, id)
    const body = parse(
      z.object({
        method: z.string().trim().min(1, '请选择跟进方式'),
        content: z.string().trim().min(1, '请填写跟进内容').max(2000),
        intentLevel: z.enum(['A', 'B', 'C', 'D']).optional().nullable(),
        isVisit: z.boolean().optional(),
        nextFollowAt: z.coerce.date().optional().nullable(),
      }),
      req.body,
    )
    const now = new Date()
    const f = await prisma.$transaction(async (tx) => {
      const f = await tx.followUp.create({
        data: { customerId: id, userId: me.id, method: body.method, content: body.content, intentLevel: body.intentLevel ?? null, isVisit: !!body.isVisit, nextFollowAt: body.nextFollowAt ?? null },
        include: { user: { select: { id: true, name: true } } },
      })
      await tx.customer.update({
        where: { id },
        data: {
          lastFollowAt: now,
          nextFollowAt: body.nextFollowAt ?? null,
          ...(body.intentLevel ? { intentLevel: body.intentLevel } : {}),
          ...(c.status === 'NEW' ? { status: 'FOLLOWING' } : {}),
        },
      })
      return f
    })
    await audit(req, 'follow', 'Customer', id, { followUpId: f.id, method: f.method })
    return f
  })

  app.delete('/follow-ups/:id', { preHandler: perm('crm.customer.view', 'crm.customer.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const f = await prisma.followUp.findUnique({ where: { id } })
    if (!f) throw notFound('跟进记录不存在')
    if (f.userId !== me.id) throw forbidden('只能删除自己的跟进记录')
    if (Date.now() - f.createdAt.getTime() > 24 * 3600 * 1000) throw forbidden('跟进记录超过 24 小时，不能删除')
    await prisma.$transaction(async (tx) => {
      await tx.followUp.delete({ where: { id } })
      const last = await tx.followUp.findFirst({ where: { customerId: f.customerId }, orderBy: { createdAt: 'desc' } })
      await tx.customer.update({ where: { id: f.customerId }, data: { lastFollowAt: last?.createdAt ?? null } })
    })
    await audit(req, 'delete', 'FollowUp', id, { customerId: f.customerId })
    return { ok: true }
  })
}
