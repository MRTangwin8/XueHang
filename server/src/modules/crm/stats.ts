import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/http'
import { badRequest } from '../../lib/errors'
import { dayjs, DEFAULT_TZ } from '../../lib/time'
import { perm, staff } from '../../plugins/auth'
import { campusLimit, statRange, zOptDay, zOptId } from './util'

const statQuery = z.object({ from: zOptDay, to: zOptDay, campusId: zOptId })

const dayKey = (d: Date) => dayjs(d).tz(DEFAULT_TZ).format('YYYY-MM-DD')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

type Money = Record<string, number>
const addMoney = (m: Money, cur: string, v: number) => (m[cur] = (m[cur] ?? 0) + v)

export default async function (app: FastifyInstance) {
  /** 概览：新增客户、跟进、到访、签约转化、渠道 / 意向 / 来源分布、按日趋势 */
  app.get('/stats/overview', { preHandler: perm('crm.report') }, async (req) => {
    const me = staff(req)
    const q = parse(statQuery, req.query)
    const { from, to, gte, lt } = statRange(q.from, q.to)
    if (gte >= lt) throw badRequest('开始日期不能晚于结束日期')
    if (dayjs(lt).diff(gte, 'day') > 366) throw badRequest('统计区间不能超过一年')
    const lim = campusLimit(me)
    const campusId = q.campusId ? (lim == null || lim.includes(q.campusId) ? q.campusId : -1) : lim == null ? undefined : lim.length === 1 ? lim[0] : { in: lim }
    const cw: Prisma.CustomerWhereInput = { deletedAt: null, ...(campusId ? { campusId } : {}) }

    const [customers, follows, channels] = await Promise.all([
      prisma.customer.findMany({
        where: { ...cw, createdAt: { gte, lt } },
        select: { id: true, createdAt: true, channelId: true, intentLevel: true, status: true, source: true },
      }),
      prisma.followUp.findMany({
        where: { createdAt: { gte, lt }, customer: cw },
        select: { createdAt: true, isVisit: true, customerId: true },
      }),
      prisma.channel.findMany({ select: { id: true, name: true, sort: true } }),
    ])
    // 本期内转为学员（签约）的客户：按学员建档时间统计
    const signedInPeriod = await prisma.customer.count({
      where: { ...cw, status: 'SIGNED', OR: [{ student: { enrolledAt: { gte, lt } } }, { studentId: null, updatedAt: { gte, lt } }] },
    })

    const newCount = customers.length
    const signedOfNew = customers.filter((c) => c.status === 'SIGNED').length
    const visits = follows.filter((f) => f.isVisit).length
    const visitCustomers = new Set(follows.filter((f) => f.isVisit).map((f) => f.customerId)).size

    const chName = new Map(channels.map((c) => [c.id, c.name]))
    const byChannelMap = new Map<number | null, { total: number; signed: number }>()
    for (const c of customers) {
      const k = c.channelId ?? null
      const v = byChannelMap.get(k) ?? { total: 0, signed: 0 }
      v.total++
      if (c.status === 'SIGNED') v.signed++
      byChannelMap.set(k, v)
    }
    const byChannel = [...byChannelMap.entries()]
      .map(([id, v]) => ({ id, name: id ? chName.get(id) ?? `#${id}` : '未填写', ...v, rate: pct(v.signed, v.total) }))
      .sort((a, b) => b.total - a.total)

    const levels = ['A', 'B', 'C', 'D']
    const byIntent = levels.map((lv) => ({ level: lv, total: customers.filter((c) => c.intentLevel === lv).length }))
    const statuses = ['NEW', 'FOLLOWING', 'SIGNED', 'LOST']
    const byStatus = statuses.map((s) => ({ status: s, total: customers.filter((c) => c.status === s).length }))
    const srcMap = new Map<string, number>()
    for (const c of customers) srcMap.set(c.source || '未填写', (srcMap.get(c.source || '未填写') ?? 0) + 1)
    const bySource = [...srcMap.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)

    // 按日趋势
    const days: { date: string; newCustomers: number; followUps: number; visits: number; signed: number }[] = []
    const idx = new Map<string, number>()
    for (let d = dayjs.tz(from, 'YYYY-MM-DD', DEFAULT_TZ); d.format('YYYY-MM-DD') <= to; d = d.add(1, 'day')) {
      idx.set(d.format('YYYY-MM-DD'), days.length)
      days.push({ date: d.format('YYYY-MM-DD'), newCustomers: 0, followUps: 0, visits: 0, signed: 0 })
    }
    for (const c of customers) {
      const i = idx.get(dayKey(c.createdAt))
      if (i != null) {
        days[i].newCustomers++
        if (c.status === 'SIGNED') days[i].signed++
      }
    }
    for (const f of follows) {
      const i = idx.get(dayKey(f.createdAt))
      if (i != null) {
        days[i].followUps++
        if (f.isVisit) days[i].visits++
      }
    }

    return {
      from,
      to,
      campusId: campusId ?? null,
      summary: {
        newCustomers: newCount,
        followUps: follows.length,
        visits,
        visitCustomers,
        signedOfNew,
        conversionRate: pct(signedOfNew, newCount),
        signedInPeriod,
      },
      byChannel,
      byIntent,
      byStatus,
      bySource,
      trend: days,
    }
  })

  /** 业绩排行：按销售统计新增客户、跟进、签约、订单、应收、实收 */
  app.get('/stats/ranking', { preHandler: perm('crm.report') }, async (req) => {
    const me = staff(req)
    const q = parse(statQuery, req.query)
    const { from, to, gte, lt } = statRange(q.from, q.to)
    if (gte >= lt) throw badRequest('开始日期不能晚于结束日期')
    const lim = campusLimit(me)
    const campusId = q.campusId ? (lim == null || lim.includes(q.campusId) ? q.campusId : -1) : lim == null ? undefined : lim.length === 1 ? lim[0] : { in: lim }
    const cw: Prisma.CustomerWhereInput = { deletedAt: null, ...(campusId ? { campusId } : {}) }

    const [newC, follows, signed, orders, payments, salesUsers] = await Promise.all([
      prisma.customer.groupBy({ by: ['ownerId'], where: { ...cw, ownerId: { not: null }, createdAt: { gte, lt } }, _count: { _all: true } }),
      prisma.followUp.groupBy({ by: ['userId'], where: { createdAt: { gte, lt }, customer: cw }, _count: { _all: true } }),
      prisma.customer.groupBy({
        by: ['ownerId'],
        where: { ...cw, ownerId: { not: null }, status: 'SIGNED', OR: [{ student: { enrolledAt: { gte, lt } } }, { studentId: null, updatedAt: { gte, lt } }] },
        _count: { _all: true },
      }),
      prisma.order.findMany({
        where: { deletedAt: null, salesId: { not: null }, status: { not: 'CANCELLED' }, signedAt: { gte, lt }, ...(campusId ? { campusId } : {}) },
        select: { salesId: true, currency: true, payableAmount: true },
      }),
      prisma.payment.findMany({
        where: { paidAt: { gte, lt }, order: { deletedAt: null, salesId: { not: null }, ...(campusId ? { campusId } : {}) } },
        select: { amount: true, currency: true, order: { select: { salesId: true } } },
      }),
      prisma.user.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          ...(campusId ? { campusId } : {}),
          roles: { some: { role: { permissions: { some: { code: 'crm.customer.view' } } } } },
        },
        select: { id: true },
      }),
    ])

    type Row = { userId: number; newCustomers: number; followUps: number; signed: number; orders: number; payable: Money; paid: Money }
    const rows = new Map<number, Row>()
    const row = (id: number) => {
      let r = rows.get(id)
      if (!r) rows.set(id, (r = { userId: id, newCustomers: 0, followUps: 0, signed: 0, orders: 0, payable: {}, paid: {} }))
      return r
    }
    salesUsers.forEach((u) => row(u.id))
    newC.forEach((g) => g.ownerId && (row(g.ownerId).newCustomers = g._count._all))
    follows.forEach((g) => (row(g.userId).followUps = g._count._all))
    signed.forEach((g) => g.ownerId && (row(g.ownerId).signed = g._count._all))
    for (const o of orders) {
      const r = row(o.salesId!)
      r.orders++
      addMoney(r.payable, o.currency, o.payableAmount)
    }
    for (const p of payments) addMoney(row(p.order.salesId!).paid, p.currency, p.amount)

    const users = await prisma.user.findMany({
      where: { id: { in: [...rows.keys()] } },
      select: { id: true, name: true, staffNo: true, campus: { select: { name: true } } },
    })
    const um = new Map(users.map((u) => [u.id, u]))
    const list = [...rows.values()]
      .filter((r) => um.has(r.userId))
      .map((r) => {
        const u = um.get(r.userId)!
        return { ...r, name: u.name, staffNo: u.staffNo, campusName: u.campus?.name ?? null, conversionRate: pct(r.signed, r.newCustomers) }
      })
      .sort(
        (a, b) =>
          (b.paid.JPY ?? 0) - (a.paid.JPY ?? 0) ||
          (b.paid.CNY ?? 0) - (a.paid.CNY ?? 0) ||
          b.signed - a.signed ||
          b.orders - a.orders ||
          b.newCustomers - a.newCustomers ||
          b.followUps - a.followUps,
      )
      .map((r, i) => ({ rank: i + 1, ...r }))

    const total = list.reduce(
      (t, r) => {
        t.newCustomers += r.newCustomers
        t.followUps += r.followUps
        t.signed += r.signed
        t.orders += r.orders
        for (const [k, v] of Object.entries(r.payable)) addMoney(t.payable, k, v)
        for (const [k, v] of Object.entries(r.paid)) addMoney(t.paid, k, v)
        return t
      },
      { newCustomers: 0, followUps: 0, signed: 0, orders: 0, payable: {} as Money, paid: {} as Money },
    )
    return { from, to, campusId: campusId ?? null, items: list, total }
  })
}
