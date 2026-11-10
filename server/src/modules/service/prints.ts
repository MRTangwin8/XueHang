import { RULES } from '../../dict'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam } from '../../lib/http'
import { badRequest, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyStudent } from '../../lib/notify'
import { fmtZoned } from '../../lib/time'
import { andCampus, assertCampus, perm, staff, scopeWhere } from '../../plugins/auth'
import { dateFilter } from './util'

/** 打印费文字：日元 / 人民币用符号，其他货币用「金额 + 自定义文字」 */
const feeText = (n: number) => {
  const c = RULES.printCurrency
  return c === 'JPY' ? `¥${n}` : c === 'CNY' ? `￥${n}` : `${n} ${c}`
}

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('print.manage') }

  app.get('/prints', guard, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({ status: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), q: z.string().optional(), campusId: z.coerce.number().int().optional() }),
      req.query,
    )
    const studentWhere: Prisma.StudentWhereInput = { ...(scopeWhere(me) as Prisma.StudentWhereInput) }
    andCampus(studentWhere, q.campusId)
    if (q.q) studentWhere.OR = [{ name: { contains: q.q } }, { studentNo: { contains: q.q } }]
    const where: Prisma.PrintRequestWhereInput = { deletedAt: null, student: studentWhere }
    if (q.status) where.status = { in: q.status.split(',') }
    const df = dateFilter(q.from, q.to)
    if (df) where.submittedAt = df
    const sumWhere: Prisma.PrintRequestWhereInput = { ...where, status: q.status ? where.status : { not: 'CANCELLED' } }
    const [items, total, sum, counts, sheets] = await Promise.all([
      prisma.printRequest.findMany({
        where,
        ...pageArgs(q),
        orderBy: [{ submittedAt: 'desc' }],
        include: { student: { select: { id: true, name: true, studentNo: true } } },
      }),
      prisma.printRequest.count({ where }),
      prisma.printRequest.aggregate({ where: sumWhere, _sum: { fee: true } }),
      prisma.printRequest.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: true }),
      prisma.printRequest.findMany({ where: sumWhere, select: { pages: true, copies: true } }),
    ])
    return {
      ...paged(items, total, q),
      totalFee: sum._sum.fee ?? 0,
      totalSheets: sheets.reduce((s, r) => s + r.pages * r.copies, 0),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    }
  })

  app.post('/prints/:id/status', guard, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const { status } = parse(z.object({ status: z.enum(['PENDING', 'PRINTED', 'PICKED_UP', 'CANCELLED']) }), req.body)
    const p = await prisma.printRequest.findFirst({ where: { id, deletedAt: null }, include: { student: { select: { campusId: true } } } })
    if (!p) throw notFound('打印申请不存在')
    assertCampus(me, p.student.campusId)
    if (p.status === status) return p
    if (p.status === 'CANCELLED') throw badRequest('该申请已取消')
    const r = await prisma.printRequest.update({ where: { id }, data: { status, handledById: me.id, handledAt: new Date() } })
    if (status === 'PRINTED') {
      await notifyStudent(p.studentId, `资料已打印，可于 ${fmtZoned(p.readyAt, 'MM月DD日 HH:mm')} 后领取`, {
        content: `${p.fileName} · 费用 ${feeText(p.fee)}`,
        link: '/portal/prints',
      })
    } else if (status === 'CANCELLED') {
      await notifyStudent(p.studentId, `您的打印申请「${p.fileName}」已被取消`, { link: '/portal/prints' })
    }
    await audit(req, 'status', 'PrintRequest', id, { from: p.status, to: status })
    return r
  })
}
