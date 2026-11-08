import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { pageArgs, pageQuery, paged, parse } from '../../lib/http'
import { perm } from '../../plugins/auth'

const P = perm('system.log')

export default async function logRoutes(app: FastifyInstance) {
  /** 操作日志：?userId&entity&action&from&to&q（q 匹配对象 ID / 详情） */
  app.get('/logs', { preHandler: P }, async (req) => {
    const q = parse(
      pageQuery.extend({
        userId: z.coerce.number().int().optional(),
        entity: z.string().trim().optional(),
        action: z.string().trim().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        q: z.string().trim().optional(),
      }),
      req.query,
    )
    const where: Prisma.OperationLogWhereInput = {}
    if (q.userId) where.userId = q.userId
    if (q.entity) where.entity = q.entity
    if (q.action) where.action = q.action
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) }
    if (q.q) where.OR = [{ entityId: q.q }, { detail: { contains: q.q } }, { ip: { contains: q.q } }]
    const [items, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, staffNo: true } } },
        ...pageArgs(q),
        orderBy: { id: 'desc' },
      }),
      prisma.operationLog.count({ where }),
    ])
    return paged(items, total, q)
  })

  /** 筛选下拉用：已出现过的对象类型与动作 */
  app.get('/logs/facets', { preHandler: P }, async () => {
    const [entities, actions] = await Promise.all([
      prisma.operationLog.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } }),
      prisma.operationLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
    ])
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action) }
  })
}
