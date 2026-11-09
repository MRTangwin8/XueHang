import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { pageArgs, pageQuery, paged, parse, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { dayjs, zonedDateTime } from '../../lib/time'
import { perm, staff } from '../../plugins/auth'
import { campusLimit, dayRange, todayStr, zDay, zFlag, zOptDay, zOptId } from './util'

/** 本人某天（YYYY-MM-DD）新增客户数 / 到访数 / 跟进数 */
async function dayStats(userId: number, date: string) {
  const range = dayRange(date, date)!
  const [newCustomers, visits, followUps] = await Promise.all([
    prisma.customer.count({ where: { ownerId: userId, deletedAt: null, createdAt: range } }),
    prisma.followUp.count({ where: { userId, isVisit: true, createdAt: range } }),
    prisma.followUp.count({ where: { userId, createdAt: range } }),
  ])
  return { newCustomers, visits, followUps }
}

export default async function (app: FastifyInstance) {
  /** 我的日报历史 */
  app.get('/daily/mine', { preHandler: perm('daily.write') }, async (req) => {
    const me = staff(req)
    const q = parse(pageQuery.extend({ from: zOptDay, to: zOptDay }), req.query)
    const where: Prisma.DailyReportWhereInput = { userId: me.id }
    const r = dayRange(q.from, q.to)
    if (r) where.reportDate = r
    const [items, total] = await Promise.all([
      prisma.dailyReport.findMany({ where, orderBy: { reportDate: 'desc' }, ...pageArgs(q) }),
      prisma.dailyReport.count({ where }),
    ])
    const readerIds = [...new Set(items.map((i) => i.readById).filter((x): x is number => x != null))]
    const readers = readerIds.length ? await prisma.user.findMany({ where: { id: { in: readerIds } }, select: { id: true, name: true } }) : []
    const rm = new Map(readers.map((u) => [u.id, u.name]))
    return paged(items.map((i) => ({ ...i, readByName: i.readById ? rm.get(i.readById) ?? null : null })), total, q)
  })

  /** 某天（默认今天）的日报 + 自动统计的默认值 */
  app.get('/daily/today', { preHandler: perm('daily.write') }, async (req) => {
    const me = staff(req)
    const { date } = parse(z.object({ date: zOptDay }), req.query)
    const d = date || todayStr()
    const reportDate = zonedDateTime(d, '00:00')
    const [report, stats] = await Promise.all([
      prisma.dailyReport.findUnique({ where: { userId_reportDate: { userId: me.id, reportDate } } }),
      dayStats(me.id, d),
    ])
    return { date: d, report, stats }
  })

  /** 写 / 改日报（每人每天一条） */
  app.put('/daily', { preHandler: perm('daily.write') }, async (req) => {
    const me = staff(req)
    const body = parse(
      z.object({
        reportDate: zDay.optional(),
        works: z.string().trim().min(1, '请填写今日工作').max(20000, '今日工作最多 20000 字'),
        unfinished: zOptStr,
        contacts: zOptStr,
        newCustomers: z.coerce.number().int().min(0).default(0),
        visits: z.coerce.number().int().min(0).default(0),
        issues: zOptStr,
        proposal: zOptStr,
        selfReview: zOptStr,
      }),
      req.body,
    )
    const { reportDate: ds, ...data } = body
    const d = ds || todayStr()
    if (d > todayStr()) throw badRequest('不能填写未来日期的日报')
    if (dayjs(d).isBefore(dayjs(todayStr()).subtract(30, 'day'))) throw badRequest('只能补写 30 天内的日报')
    const reportDate = zonedDateTime(d, '00:00')
    const r = await prisma.dailyReport.upsert({
      where: { userId_reportDate: { userId: me.id, reportDate } },
      create: { userId: me.id, reportDate, ...data },
      // 修改后重新标记为未读，便于主管看到更新
      update: { ...data, readById: null, readAt: null },
    })
    await audit(req, 'save', 'DailyReport', r.id, { date: d })
    return r
  })

  /** 业务日报（全员） */
  app.get('/daily', { preHandler: perm('crm.daily.all') }, async (req) => {
    const me = staff(req)
    const q = parse(pageQuery.extend({ userId: zOptId, from: zOptDay, to: zOptDay, unread: zFlag }), req.query)
    const where: Prisma.DailyReportWhereInput = {}
    if (q.userId) where.userId = q.userId
    const r = dayRange(q.from, q.to)
    if (r) where.reportDate = r
    if (q.unread) where.readAt = null
    const lim = campusLimit(me)
    if (lim) where.user = { campusId: { in: lim } }
    const [items, total, unread] = await Promise.all([
      prisma.dailyReport.findMany({
        where,
        orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
        include: { user: { select: { id: true, name: true, staffNo: true, campus: { select: { name: true } } } } },
      }),
      prisma.dailyReport.count({ where }),
      prisma.dailyReport.count({ where: { ...where, readAt: null } }),
    ])
    const readerIds = [...new Set(items.map((i) => i.readById).filter((x): x is number => x != null))]
    const readers = readerIds.length ? await prisma.user.findMany({ where: { id: { in: readerIds } }, select: { id: true, name: true } }) : []
    const rm = new Map(readers.map((u) => [u.id, u.name]))
    return { ...paged(items.map((i) => ({ ...i, readByName: i.readById ? rm.get(i.readById) ?? null : null })), total, q), unread }
  })

  app.post('/daily/:id/read', { preHandler: perm('crm.daily.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const d = await prisma.dailyReport.findUnique({ where: { id }, include: { user: { select: { campusId: true } } } })
    if (!d) throw notFound('日报不存在')
    const lim = campusLimit(me)
    if (lim && !(d.user.campusId != null && lim.includes(d.user.campusId))) throw forbidden('无权查看其他校区的日报')
    if (d.userId === me.id) return { ok: true, self: true }
    if (!d.readAt) await prisma.dailyReport.update({ where: { id }, data: { readById: me.id, readAt: new Date() } })
    return { ok: true }
  })
}
