import { workbookBuffer } from '../../lib/excel'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zId, zOptStr } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyUser } from '../../lib/notify'
import { fmtZoned } from '../../lib/time'
import { perm, staff } from '../../plugins/auth'
import { canReviewOwn, reviewableUsers } from './wage-scope'
import { DICTS } from '../../dict'
import { currentMonth, monthRange } from './util'

const statusLabel = (v: string) => DICTS.wageStatuses.find((o) => o.value === v)?.label ?? v
const zMonth = z.string().regex(/^\d{4}-\d{2}$/, '月份格式应为 YYYY-MM')

const wageBody = z.object({
  workDate: z.coerce.date(),
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
  category: z.string().trim().min(1).max(20).default('授课'),
  hours: z.coerce.number().positive('工时必须大于 0').max(24, '工时不能超过 24 小时'),
  hourlyRate: z.coerce.number().int().min(0).optional().nullable(),
  transportFee: z.coerce.number().int().min(0).optional().nullable(),
  fromStation: zOptStr,
  toStation: zOptStr,
  content: z.string().trim().min(1, '请填写工作内容').max(1000),
  sessionId: zId.optional().nullable(),
})

const wageInclude = {
  user: { select: { id: true, name: true, staffNo: true, campusId: true } },
  reviewer: { select: { id: true, name: true } },
  session: { select: { id: true, title: true, startAt: true, endAt: true } },
} satisfies Prisma.WageClaimInclude

/** 已被申报的课次（未删除、未被驳回） */
const activeClaimWhere: Prisma.WageClaimWhereInput = { deletedAt: null, status: { not: 'REJECTED' } }

function totals(rows: { hours: number; amount: number; transportFee: number }[]) {
  const hours = Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const amount = rows.reduce((s, r) => s + r.amount, 0)
  const transport = rows.reduce((s, r) => s + r.transportFee, 0)
  return { count: rows.length, hours, amount, transport, total: amount + transport }
}

async function assertSessionClaimable(userId: number, sessionId: number, exceptClaimId?: number) {
  const s = await prisma.session.findFirst({ where: { id: sessionId, teacherId: userId, status: { not: 'CANCELLED' } } })
  if (!s) throw badRequest('关联课次不存在、已取消或不是本人的课次')
  const dup = await prisma.wageClaim.findFirst({ where: { ...activeClaimWhere, sessionId, ...(exceptClaimId ? { id: { not: exceptClaimId } } : {}) } })
  if (dup) throw badRequest('该课次已申报过')
  return s
}

export default async function (app: FastifyInstance) {
  // ---------------- 本人申报 ----------------
  app.get('/wage/mine', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const q = parse(z.object({ month: zMonth.optional() }), req.query)
    const month = q.month ?? currentMonth()
    const { start, end } = monthRange(month)
    const items = await prisma.wageClaim.findMany({
      where: { userId: me.id, deletedAt: null, workDate: { gte: start, lt: end } },
      orderBy: [{ workDate: 'asc' }, { startAt: 'asc' }, { id: 'asc' }],
      include: wageInclude,
    })
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { hourlyWage: true, transportFee: true } })
    return {
      month,
      items,
      summary: totals(items),
      approved: totals(items.filter((i) => i.status === 'APPROVED')),
      pending: totals(items.filter((i) => i.status === 'PENDING')),
      defaults: { hourlyRate: user?.hourlyWage ?? null, transportFee: user?.transportFee ?? null },
    }
  })

  /** 本人当月已上的课次（未取消、未申报过） */
  app.get('/wage/my-sessions', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const q = parse(z.object({ month: zMonth.optional() }), req.query)
    const { start, end } = monthRange(q.month ?? currentMonth())
    const sessions = await prisma.session.findMany({
      where: {
        teacherId: me.id,
        status: { not: 'CANCELLED' },
        startAt: { gte: start, lt: end },
        endAt: { lte: new Date() },
        wageClaims: { none: activeClaimWhere },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, kind: true, title: true, startAt: true, endAt: true, hours: true, room: { select: { name: true } } },
    })
    return sessions.map((s) => ({ ...s, duration: Math.round(((+s.endAt - +s.startAt) / 3_600_000) * 100) / 100 }))
  })

  app.post('/wage', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const b = parse(wageBody, req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { hourlyWage: true, transportFee: true } })
    const hourlyRate = b.hourlyRate ?? user.hourlyWage
    if (hourlyRate == null) throw badRequest('未设置默认时薪，请填写时薪')
    if (b.sessionId) await assertSessionClaimable(me.id, b.sessionId)
    if (b.startAt && b.endAt && b.endAt <= b.startAt) throw badRequest('结束时间必须晚于开始时间')
    const w = await prisma.wageClaim.create({
      data: {
        userId: me.id,
        workDate: b.workDate,
        startAt: b.startAt ?? null,
        endAt: b.endAt ?? null,
        category: b.category,
        hours: b.hours,
        hourlyRate,
        amount: Math.round(b.hours * hourlyRate),
        transportFee: b.transportFee ?? user.transportFee ?? 0,
        fromStation: b.fromStation ?? null,
        toStation: b.toStation ?? null,
        content: b.content,
        sessionId: b.sessionId ?? null,
      },
    })
    await audit(req, 'create', 'WageClaim', w.id)
    return w
  })

  /** 一键申报：按课次批量生成（同一天只计一次交通费） */
  app.post('/wage/from-sessions', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const b = parse(z.object({ sessionIds: z.array(zId).min(1, '请选择课次'), fromStation: zOptStr, toStation: zOptStr, transportFee: z.coerce.number().int().min(0).optional().nullable() }), req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { hourlyWage: true, transportFee: true } })
    if (user.hourlyWage == null) throw badRequest('未设置默认时薪，请逐条申报并填写时薪')
    const sessions = await prisma.session.findMany({
      where: { id: { in: b.sessionIds }, teacherId: me.id, status: { not: 'CANCELLED' }, wageClaims: { none: activeClaimWhere } },
      orderBy: { startAt: 'asc' },
    })
    if (!sessions.length) throw badRequest('所选课次均已申报或不可申报')
    const fee = b.transportFee ?? user.transportFee ?? 0
    const days = new Set<string>()
    const data = sessions.map((s) => {
      const day = fmtZoned(s.startAt, 'YYYY-MM-DD')
      const first = !days.has(day)
      days.add(day)
      const hours = Math.round(((+s.endAt - +s.startAt) / 3_600_000) * 100) / 100
      return {
        userId: me.id,
        workDate: s.startAt,
        startAt: s.startAt,
        endAt: s.endAt,
        category: '授课',
        hours,
        hourlyRate: user.hourlyWage!,
        amount: Math.round(hours * user.hourlyWage!),
        transportFee: first ? fee : 0,
        fromStation: first ? (b.fromStation ?? null) : null,
        toStation: first ? (b.toStation ?? null) : null,
        content: `${s.title}（${fmtZoned(s.startAt, 'HH:mm')}-${fmtZoned(s.endAt, 'HH:mm')}）`,
        sessionId: s.id,
      }
    })
    await prisma.wageClaim.createMany({ data })
    await audit(req, 'create', 'WageClaim', null, { fromSessions: sessions.map((s) => s.id) })
    return { created: data.length }
  })

  app.put('/wage/:id', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(wageBody, req.body)
    const old = await prisma.wageClaim.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('申报记录不存在')
    if (old.userId !== me.id) throw forbidden('只能修改本人的申报')
    if (old.status === 'APPROVED') throw badRequest('已通过的申报不能修改')
    if (b.sessionId && b.sessionId !== old.sessionId) await assertSessionClaimable(me.id, b.sessionId, id)
    const hourlyRate = b.hourlyRate ?? old.hourlyRate
    const w = await prisma.wageClaim.update({
      where: { id },
      data: {
        workDate: b.workDate,
        startAt: b.startAt ?? null,
        endAt: b.endAt ?? null,
        category: b.category,
        hours: b.hours,
        hourlyRate,
        amount: Math.round(b.hours * hourlyRate),
        transportFee: b.transportFee ?? old.transportFee,
        fromStation: b.fromStation ?? null,
        toStation: b.toStation ?? null,
        content: b.content,
        sessionId: b.sessionId ?? null,
        // 未通过的申报修改后重新进入待审核
        status: 'PENDING',
        reviewerId: null,
        reviewedAt: null,
      },
    })
    await audit(req, 'update', 'WageClaim', id)
    return w
  })

  app.delete('/wage/:id', { preHandler: perm('wage.claim') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.wageClaim.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('申报记录不存在')
    if (old.userId !== me.id) throw forbidden('只能删除本人的申报')
    if (old.status === 'APPROVED') throw badRequest('已通过的申报不能删除')
    await prisma.wageClaim.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'WageClaim', id)
    return { ok: true }
  })

  // ---------------- 审核 ----------------
  const reviewQuery = z.object({
    status: z.string().optional(),
    userId: z.coerce.number().int().optional(),
    month: zMonth.optional(),
    campusId: z.coerce.number().int().optional(),
    category: z.string().optional(),
  })
  async function reviewWhere(req: Parameters<typeof staff>[0], q: z.infer<typeof reviewQuery>): Promise<Prisma.WageClaimWhereInput> {
    const me = staff(req)
    // 审核范围（按人配置，见 wage-scope.ts）放在 AND 里，筛选参数无法越出范围
    const where: Prisma.WageClaimWhereInput = { deletedAt: null, AND: [{ user: await reviewableUsers(me) }] }
    if (q.campusId) where.user = { campusId: q.campusId }
    if (q.status) where.status = { in: q.status.split(',') }
    if (q.userId) where.userId = q.userId
    if (q.category) where.category = q.category
    if (q.month) {
      const { start, end } = monthRange(q.month)
      where.workDate = { gte: start, lt: end }
    }
    return where
  }

  app.get('/wage', { preHandler: perm('wage.review') }, async (req) => {
    const q = parse(pageQuery.extend(reviewQuery.shape), req.query)
    const where = await reviewWhere(req, q)
    const [items, total, all, counts] = await Promise.all([
      prisma.wageClaim.findMany({ where, ...pageArgs(q), orderBy: [{ workDate: 'desc' }, { id: 'desc' }], include: wageInclude }),
      prisma.wageClaim.count({ where }),
      prisma.wageClaim.findMany({ where, select: { hours: true, amount: true, transportFee: true } }),
      prisma.wageClaim.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: true }),
    ])
    return { ...paged(items, total, q), summary: totals(all), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) }
  })

  /** 批量通过 / 不通过 */
  app.post('/wage/review', { preHandler: perm('wage.review') }, async (req) => {
    const me = staff(req)
    const b = parse(z.object({ ids: z.array(zId).min(1, '请选择申报记录'), status: z.enum(['APPROVED', 'REJECTED']), reviewNote: zOptStr }), req.body)
    if (b.status === 'REJECTED' && !b.reviewNote) throw badRequest('不通过时请填写原因')
    const scope: Prisma.WageClaimWhereInput = { deletedAt: null, id: { in: b.ids }, user: await reviewableUsers(me) }
    const inScope = await prisma.wageClaim.findMany({ where: scope, select: { id: true, userId: true } })
    // 除超级管理员外不能审核自己的申报
    const targets = canReviewOwn(me) ? inScope : inScope.filter((t) => t.userId !== me.id)
    if (!targets.length) throw badRequest(inScope.length ? '不能审核自己的工资申报' : '没有可审核的记录（不在您的审核范围内）')
    await prisma.wageClaim.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { status: b.status, reviewerId: me.id, reviewedAt: new Date(), reviewNote: b.reviewNote ?? null },
    })
    const byUser = new Map<number, number>()
    for (const t of targets) byUser.set(t.userId, (byUser.get(t.userId) ?? 0) + 1)
    for (const [userId, n] of byUser)
      await notifyUser(userId, `您有 ${n} 条工资申报${b.status === 'APPROVED' ? '已通过' : '未通过'}`, { content: b.reviewNote ?? undefined, link: '/teacher/wage' })
    await audit(req, 'review', 'WageClaim', null, { ids: targets.map((t) => t.id), status: b.status })
    return { updated: targets.length }
  })

  async function summaryRows(req: Parameters<typeof staff>[0], q: z.infer<typeof reviewQuery>) {
    const rows = await prisma.wageClaim.findMany({ where: await reviewWhere(req, q), include: { user: { select: { id: true, name: true, staffNo: true, bankName: true, bankBranch: true, bankAccount: true, bankHolder: true } } } })
    const map = new Map<number, { userId: number; name: string; staffNo: string; bank: string; rows: typeof rows }>()
    for (const r of rows) {
      let m = map.get(r.userId)
      if (!m) {
        const u = r.user
        m = { userId: u.id, name: u.name, staffNo: u.staffNo, bank: [u.bankName, u.bankBranch, u.bankAccount, u.bankHolder].filter(Boolean).join(' '), rows: [] }
        map.set(r.userId, m)
      }
      m.rows.push(r)
    }
    return [...map.values()]
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        staffNo: m.staffNo,
        bank: m.bank,
        ...totals(m.rows),
        approved: totals(m.rows.filter((r) => r.status === 'APPROVED')),
        pending: totals(m.rows.filter((r) => r.status === 'PENDING')),
        rejected: totals(m.rows.filter((r) => r.status === 'REJECTED')),
      }))
      .sort((a, b) => a.staffNo.localeCompare(b.staffNo))
  }

  /** 按人汇总 */
  app.get('/wage/summary', { preHandler: perm('wage.review') }, async (req) => {
    const q = parse(reviewQuery, req.query)
    const month = q.month ?? currentMonth()
    const items = await summaryRows(req, { ...q, month })
    return { month, items }
  })

  app.get('/wage/export', { preHandler: perm('wage.review') }, async (req, reply: FastifyReply) => {
    const q = parse(reviewQuery, req.query)
    const month = q.month ?? currentMonth()
    const where = await reviewWhere(req, { ...q, month })
    const rows = await prisma.wageClaim.findMany({ where, orderBy: [{ userId: 'asc' }, { workDate: 'asc' }], include: wageInclude })
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('申报明细')
    ws.columns = [
      { header: '工号', key: 'staffNo', width: 10 },
      { header: '姓名', key: 'name', width: 12 },
      { header: '日期', key: 'date', width: 12 },
      { header: '时间', key: 'time', width: 14 },
      { header: '类别', key: 'category', width: 8 },
      { header: '工时', key: 'hours', width: 8 },
      { header: '时薪', key: 'hourlyRate', width: 8 },
      { header: '金额', key: 'amount', width: 10 },
      { header: '交通费', key: 'transportFee', width: 8 },
      { header: '区间', key: 'route', width: 20 },
      { header: '工作内容', key: 'content', width: 36 },
      { header: '状态', key: 'status', width: 8 },
      { header: '审核备注', key: 'reviewNote', width: 20 },
    ]
    for (const r of rows)
      ws.addRow({
        staffNo: r.user.staffNo,
        name: r.user.name,
        date: fmtZoned(r.workDate, 'YYYY-MM-DD'),
        time: r.startAt && r.endAt ? `${fmtZoned(r.startAt, 'HH:mm')}-${fmtZoned(r.endAt, 'HH:mm')}` : '',
        category: r.category,
        hours: r.hours,
        hourlyRate: r.hourlyRate,
        amount: r.amount,
        transportFee: r.transportFee,
        route: [r.fromStation, r.toStation].filter(Boolean).join(' → '),
        content: r.content,
        status: statusLabel(r.status),
        reviewNote: r.reviewNote ?? '',
      })
    const ws2 = wb.addWorksheet('按人汇总')
    ws2.columns = [
      { header: '工号', key: 'staffNo', width: 10 },
      { header: '姓名', key: 'name', width: 12 },
      { header: '条数', key: 'count', width: 8 },
      { header: '总工时', key: 'hours', width: 10 },
      { header: '工资', key: 'amount', width: 12 },
      { header: '交通费', key: 'transport', width: 10 },
      { header: '合计', key: 'total', width: 12 },
      { header: '其中已通过', key: 'approvedTotal', width: 12 },
      { header: '待审核', key: 'pendingTotal', width: 12 },
      { header: '银行信息', key: 'bank', width: 36 },
    ]
    for (const s of await summaryRows(req, { ...q, month })) ws2.addRow({ ...s, approvedTotal: s.approved.total, pendingTotal: s.pending.total })
    for (const w of [ws, ws2]) w.getRow(1).font = { bold: true }
    const name = `工资申报_${month}.xlsx`
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
    return reply.send(await workbookBuffer(wb))
  })
}
