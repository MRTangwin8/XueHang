import { workbookBuffer } from '../../lib/excel'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import ExcelJS from 'exceljs'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zId, zOptStr } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { andCampus, inCampus, perm, staff, staffOnly, hasPerm, scopeWhere, type StaffPrincipal } from '../../plugins/auth'
import { audit } from '../../lib/audit'
import { dayjs, DEFAULT_TZ, fmtZoned, startOfZonedDay } from '../../lib/time'
import { DICTS } from '../../dict'
import { studentAccess } from '../students/service'
import { nextOrderNo, recalcOrder, orderVisible, loadOrderForAccess, orderScope } from './service'

// ------------------------------------------------------------------
// zod 片段
// ------------------------------------------------------------------
const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional())
const optNum = z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nullable().optional())
const optInt = z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).nullable().optional())
const optId = z.preprocess((v) => (v === '' || v === 0 ? null : v), z.coerce.number().int().positive().nullable().optional())
const boolish = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean().optional())

const PAYMENT_METHODS = DICTS.paymentMethods as readonly string[]
const PAYMENT_KINDS = DICTS.paymentKinds as readonly string[]

const paymentBody = z.object({
  amount: z.coerce.number({ error: '请填写缴费金额' }).int('金额须为整数').positive('缴费金额须大于 0'),
  method: z.string({ error: '请选择缴费方式' }).refine((v) => PAYMENT_METHODS.includes(v), '缴费方式无效'),
  kind: z
    .string()
    .default('报名缴费')
    .refine((v) => PAYMENT_KINDS.includes(v), '缴费类别无效'),
  paidAt: optDate,
  note: zOptStr,
  receiptUrl: zOptStr,
})

const productBody = z.object({
  type: z.enum(['SINGLE', 'PACKAGE'], { error: '课程类型无效' }),
  name: z.string({ error: '请填写课程名称' }).trim().min(1, '请填写课程名称'),
  category: zOptStr,
  price: z.coerce.number({ error: '请填写价格' }).int('价格须为整数').min(0, '价格不能为负'),
  originalPrice: optInt,
  vipHours: optNum,
  description: zOptStr,
  active: z.boolean().default(true),
  sort: z.coerce.number().int().default(50),
  campusId: optId,
  itemIds: z.array(zId).default([]),
})

/** 日期区间（业务时区）：from 当天 00:00 起，to 当天结束（不含次日 00:00） */
function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined
  const r: Prisma.DateTimeFilter = {}
  if (from) r.gte = startOfZonedDay(from)
  if (to) r.lt = dayjs(startOfZonedDay(to)).add(1, 'day').toDate()
  return r
}

const userLite = { select: { id: true, name: true } } as const
const studentLite = { select: { id: true, name: true, studentNo: true } } as const

async function sumsByCurrency<T extends { currency: string; _sum: { amount: number | null } }>(rows: T[]) {
  const sums: Record<string, number> = {}
  for (const r of rows) sums[r.currency] = (sums[r.currency] ?? 0) + (r._sum.amount ?? 0)
  return sums
}

function sendXlsx(reply: FastifyReply, name: string, buf: ArrayBuffer | Buffer) {
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
    .send(Buffer.from(buf as ArrayBuffer))
}

// ------------------------------------------------------------------
// 缴费明细 where（列表与导出共用）
// ------------------------------------------------------------------
const paymentQuery = pageQuery.extend({
  from: z.string().optional(),
  to: z.string().optional(),
  method: z.string().optional(),
  kind: z.string().optional(),
  payeeId: z.coerce.number().int().optional(),
  campusId: z.coerce.number().int().optional(),
  orderId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
})

function paymentWhere(me: StaffPrincipal, q: z.infer<typeof paymentQuery>): Prisma.PaymentWhereInput {
  const sc = orderScope(me, 'payeeId')
  const orderW: Prisma.OrderWhereInput = { deletedAt: null }
  const and: Prisma.PaymentWhereInput[] = []
  if (sc.kind === 'all') Object.assign(orderW, sc.where)
  else and.push({ payeeId: me.id })
  andCampus(orderW, q.campusId)
  if (q.q) orderW.OR = [{ orderNo: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }]
  and.push({ order: orderW })
  const paidAt = dateRange(q.from, q.to)
  if (paidAt) and.push({ paidAt })
  if (q.method) and.push({ method: q.method })
  if (q.kind) and.push({ kind: q.kind })
  if (q.payeeId) and.push({ payeeId: q.payeeId })
  if (q.orderId) and.push({ orderId: q.orderId })
  return { AND: and }
}

export default async function (app: FastifyInstance) {
  // ================================================================
  // 课程产品（单期 / 套餐）
  // ================================================================
  app.get('/products', { preHandler: staffOnly }, async (req) => {
    const q = parse(
      z.object({ type: z.enum(['SINGLE', 'PACKAGE']).optional(), q: z.string().trim().optional(), active: boolish, campusId: z.coerce.number().int().optional() }),
      req.query,
    )
    const where: Prisma.CourseProductWhereInput = { deletedAt: null }
    if (q.type) where.type = q.type
    if (q.q) where.name = { contains: q.q }
    if (q.active !== undefined) where.active = q.active
    if (q.campusId) where.OR = [{ campusId: q.campusId }, { campusId: null }]
    const rows = await prisma.courseProduct.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        campus: { select: { id: true, name: true } },
        packageItems: { include: { product: { select: { id: true, name: true, price: true, deletedAt: true } } } },
      },
    })
    return rows.map(({ packageItems, ...p }) => {
      const items = packageItems.filter((i) => !i.product.deletedAt).map((i) => ({ id: i.product.id, name: i.product.name, price: i.product.price }))
      return { ...p, items, itemIds: items.map((i) => i.id) }
    })
  })

  async function checkItemIds(itemIds: number[]) {
    if (!itemIds.length) return
    const n = await prisma.courseProduct.count({ where: { id: { in: itemIds }, type: 'SINGLE', deletedAt: null } })
    if (n !== new Set(itemIds).size) throw badRequest('套餐只能包含有效的单期课程')
  }

  app.post('/products', { preHandler: perm('product.manage') }, async (req) => {
    const body = parse(productBody, req.body)
    const itemIds = body.type === 'PACKAGE' ? [...new Set(body.itemIds)] : []
    await checkItemIds(itemIds)
    const { itemIds: _i, ...data } = body
    const p = await prisma.courseProduct.create({
      data: { ...data, packageItems: { create: itemIds.map((productId) => ({ productId })) } },
    })
    await audit(req, 'create', 'CourseProduct', p.id, { name: p.name, type: p.type })
    return p
  })

  app.put('/products/:id', { preHandler: perm('product.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const body = parse(productBody, req.body)
    const old = await prisma.courseProduct.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('课程不存在')
    if (old.type !== body.type) throw badRequest('不能修改课程类型')
    const itemIds = body.type === 'PACKAGE' ? [...new Set(body.itemIds)].filter((x) => x !== id) : []
    await checkItemIds(itemIds)
    const { itemIds: _i, ...data } = body
    await prisma.$transaction(async (tx) => {
      await tx.courseProduct.update({ where: { id }, data })
      if (body.type === 'PACKAGE') {
        await tx.packageItem.deleteMany({ where: { packageId: id } })
        if (itemIds.length) await tx.packageItem.createMany({ data: itemIds.map((productId) => ({ packageId: id, productId })) })
      }
    })
    await audit(req, 'update', 'CourseProduct', id, { name: body.name })
    return { ok: true }
  })

  app.delete('/products/:id', { preHandler: perm('product.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const p = await prisma.courseProduct.findFirst({ where: { id, deletedAt: null } })
    if (!p) throw notFound('课程不存在')
    await prisma.courseProduct.update({ where: { id }, data: { deletedAt: new Date(), active: false } })
    await audit(req, 'delete', 'CourseProduct', id, { name: p.name })
    return { ok: true }
  })

  // ================================================================
  // 缴费明细 / 导出（静态路径，放在 /:id 之前便于阅读）
  // ================================================================
  app.get('/payments', { preHandler: perm('order.view', 'order.all') }, async (req) => {
    const me = staff(req)
    const q = parse(paymentQuery, req.query)
    const where = paymentWhere(me, q)
    const [items, total, groups] = await Promise.all([
      prisma.payment.findMany({
        where,
        ...pageArgs(q),
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        include: {
          payee: userLite,
          order: { select: { id: true, orderNo: true, campusId: true, campus: { select: { name: true } }, student: studentLite, package: { select: { name: true } } } },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ['currency'], where, _sum: { amount: true } }),
    ])
    return { ...paged(items, total, q), sums: await sumsByCurrency(groups) }
  })

  app.get('/payments/export', { preHandler: perm('order.view', 'order.all') }, async (req, reply) => {
    const me = staff(req)
    const q = parse(paymentQuery, req.query)
    const rows = await prisma.payment.findMany({
      where: paymentWhere(me, q),
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 20000,
      include: {
        payee: userLite,
        order: { select: { orderNo: true, campus: { select: { name: true } }, student: studentLite, package: { select: { name: true } } } },
      },
    })
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('缴费明细')
    ws.columns = [
      { header: '缴费日期', key: 'paidAt', width: 14 },
      { header: '订单号', key: 'orderNo', width: 16 },
      { header: '学号', key: 'studentNo', width: 12 },
      { header: '学员', key: 'student', width: 12 },
      { header: '私塾套餐', key: 'pkg', width: 24 },
      { header: '类别', key: 'kind', width: 16 },
      { header: '方式', key: 'method', width: 12 },
      { header: '币种', key: 'currency', width: 8 },
      { header: '金额', key: 'amount', width: 12 },
      { header: '经手人', key: 'payee', width: 10 },
      { header: '校区', key: 'campus', width: 12 },
      { header: '备注', key: 'note', width: 30 },
    ]
    ws.getRow(1).font = { bold: true }
    const sums: Record<string, number> = {}
    for (const r of rows) {
      sums[r.currency] = (sums[r.currency] ?? 0) + r.amount
      ws.addRow({
        paidAt: fmtZoned(r.paidAt, 'YYYY-MM-DD', DEFAULT_TZ),
        orderNo: r.order.orderNo,
        studentNo: r.order.student.studentNo,
        student: r.order.student.name,
        pkg: r.order.package?.name ?? '',
        kind: r.kind,
        method: r.method,
        currency: r.currency,
        amount: r.amount,
        payee: r.payee?.name ?? '',
        campus: r.order.campus.name,
        note: r.note ?? '',
      })
    }
    for (const [cur, amt] of Object.entries(sums)) {
      const row = ws.addRow({ kind: '合计', currency: cur, amount: amt })
      row.font = { bold: true }
    }
    ws.getColumn('amount').numFmt = '#,##0'
    const buf = await workbookBuffer(wb)
    return sendXlsx(reply, `缴费明细_${dayjs().tz(DEFAULT_TZ).format('YYYYMMDD')}.xlsx`, buf)
  })

  app.delete('/payments/:pid', { preHandler: perm('order.all') }, async (req) => {
    const me = staff(req)
    const { pid } = parse(z.object({ pid: zId }), req.params)
    const p = await prisma.payment.findUnique({ where: { id: pid }, include: { order: { include: { student: { select: { salesId: true } } } } } })
    if (!p || p.order.deletedAt) throw notFound('缴费记录不存在')
    if (!orderVisible(me, p.order)) throw forbidden('无权操作该订单')
    const today = dayjs().tz(DEFAULT_TZ).format('YYYY-MM-DD')
    if (fmtZoned(p.createdAt, 'YYYY-MM-DD', DEFAULT_TZ) !== today) throw badRequest('只能删除当天登记的缴费记录')
    await prisma.$transaction(async (tx) => {
      const refunded = (await tx.refund.aggregate({ where: { orderId: p.orderId }, _sum: { amount: true } }))._sum.amount ?? 0
      if (p.order.paidAmount - p.amount < refunded) throw badRequest('删除后已收金额将少于已退金额，无法删除')
      await tx.payment.delete({ where: { id: pid } })
      await recalcOrder(tx, p.orderId)
    })
    await audit(req, 'delete', 'Payment', pid, { orderNo: p.order.orderNo, amount: p.amount })
    return { ok: true }
  })

  // ================================================================
  // 退费记录
  // ================================================================
  app.get('/refunds', { preHandler: perm('order.refund', 'order.all') }, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({
        from: z.string().optional(),
        to: z.string().optional(),
        method: z.string().optional(),
        campusId: z.coerce.number().int().optional(),
        q: z.string().trim().optional(),
      }),
      req.query,
    )
    const orderW: Prisma.OrderWhereInput = { deletedAt: null, ...(scopeWhere(me) as Prisma.OrderWhereInput) }
    andCampus(orderW, q.campusId)
    if (q.q) orderW.OR = [{ orderNo: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }]
    const where: Prisma.RefundWhereInput = { order: orderW }
    const range = dateRange(q.from, q.to)
    if (range) where.refundedAt = range
    if (q.method) where.method = q.method
    const [items, total, groups] = await Promise.all([
      prisma.refund.findMany({
        where,
        ...pageArgs(q),
        orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
        include: {
          operator: userLite,
          order: { select: { id: true, orderNo: true, campus: { select: { name: true } }, student: studentLite, package: { select: { name: true } } } },
        },
      }),
      prisma.refund.count({ where }),
      prisma.refund.groupBy({ by: ['currency'], where, _sum: { amount: true } }),
    ])
    return { ...paged(items, total, q), sums: await sumsByCurrency(groups) }
  })

  // ================================================================
  // 订单
  // ================================================================
  app.post('/', { preHandler: perm('student.enroll', 'order.pay') }, async (req) => {
    const me = staff(req)
    const body = parse(
      z.object({
        studentId: zId,
        packageId: z.coerce.number({ error: '请选择私塾套餐' }).int().positive('请选择私塾套餐'),
        classMode: z.enum(['CLASS', 'VIP', 'BOTH'], { error: '请选择班级分配' }),
        vipHours: optNum,
        vipContent: zOptStr,
        extraProductIds: z.array(zId).default([]),
        currency: z.enum(['JPY', 'CNY']).default('JPY'),
        discountAmount: z.coerce.number().int('优惠金额须为整数').min(0, '优惠金额不能为负').default(0),
        discountReason: zOptStr,
        signedAt: optDate,
        expireAt: optDate,
        note: zOptStr,
        salesId: optId,
        firstPayment: paymentBody.nullable().optional(),
      }),
      req.body,
    )
    const student = await prisma.student.findFirst({ where: { id: body.studentId, deletedAt: null } })
    if (!student) throw notFound('学员不存在')
    if (!hasPerm(me, 'order.all') && !studentAccess(me, student).canView && student.salesId !== me.id)
      throw forbidden('无权为该学员下单')

    const pkg = await prisma.courseProduct.findFirst({ where: { id: body.packageId, type: 'PACKAGE', deletedAt: null } })
    if (!pkg) throw badRequest('私塾套餐不存在')
    if (!pkg.active) throw badRequest('该套餐已停用')
    const hasVip = body.classMode !== 'CLASS'
    if (hasVip) {
      if (!body.vipHours || body.vipHours <= 0) throw badRequest('选择 VIP 时请填写 VIP 课时（大于 0）')
      if (!body.vipContent) throw badRequest('选择 VIP 时请填写 VIP 课程内容')
    }
    if (body.discountReason && !(DICTS.discountReasons as readonly string[]).includes(body.discountReason)) throw badRequest('优惠原因无效')
    if (body.discountAmount > 0 && !body.discountReason) throw badRequest('有优惠金额时请选择优惠原因')

    const extraIds = [...new Set(body.extraProductIds)]
    const extras = extraIds.length
      ? await prisma.courseProduct.findMany({ where: { id: { in: extraIds }, type: 'SINGLE', deletedAt: null } })
      : []
    if (extras.length !== extraIds.length) throw badRequest('追加的单期课程无效')
    const extraSum = extras.reduce((s, p) => s + p.price, 0)
    const listAmount = (pkg.originalPrice ?? pkg.price) + extraSum
    const payableAmount = pkg.price + extraSum - body.discountAmount
    if (payableAmount < 0) throw badRequest('优惠金额不能超过应收金额')

    if (body.salesId) {
      const u = await prisma.user.findFirst({ where: { id: body.salesId, deletedAt: null } })
      if (!u) throw badRequest('销售顾问工号不存在')
    }

    const order = await prisma.$transaction(async (tx) => {
      const orderNo = await nextOrderNo(tx)
      const o = await tx.order.create({
        data: {
          orderNo,
          studentId: student.id,
          campusId: student.campusId,
          salesId: body.salesId === undefined ? me.id : body.salesId,
          packageId: pkg.id,
          classMode: body.classMode,
          vipHours: hasVip ? body.vipHours : null,
          vipContent: hasVip ? body.vipContent : null,
          currency: body.currency,
          listAmount,
          discountAmount: body.discountAmount,
          discountReason: body.discountReason ?? null,
          payableAmount,
          signedAt: body.signedAt ?? new Date(),
          expireAt: body.expireAt ?? null,
          note: body.note ?? null,
          items: {
            create: [
              { productId: pkg.id, name: pkg.name, price: pkg.price },
              ...extras.map((p) => ({ productId: p.id, name: p.name, price: p.price })),
            ],
          },
        },
      })
      if (hasVip) {
        await tx.vipPackage.create({
          data: {
            studentId: student.id,
            orderId: o.id,
            name: `${pkg.name} VIP`,
            subject: body.vipContent,
            totalHours: body.vipHours!,
            expireAt: body.expireAt ?? null,
          },
        })
      }
      if (body.firstPayment) {
        const fp = body.firstPayment
        await tx.payment.create({
          data: {
            orderId: o.id,
            kind: fp.kind,
            amount: fp.amount,
            currency: body.currency,
            method: fp.method,
            paidAt: fp.paidAt ?? new Date(),
            payeeId: me.id,
            receiptUrl: fp.receiptUrl ?? null,
            note: fp.note ?? null,
          },
        })
      }
      return recalcOrder(tx, o.id)
    })
    await audit(req, 'create', 'Order', order.id, {
      orderNo: order.orderNo,
      studentId: student.id,
      payableAmount,
      classMode: body.classMode,
      firstPayment: body.firstPayment?.amount,
    })
    return order
  })

  app.get('/', { preHandler: perm('order.view', 'order.all') }, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({
        scope: z.enum(['mine', 'all']).optional(),
        q: z.string().trim().optional(),
        status: z.string().optional(),
        studentId: z.coerce.number().int().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        salesId: z.coerce.number().int().optional(),
        campusId: z.coerce.number().int().optional(),
        packageId: z.coerce.number().int().optional(),
      }),
      req.query,
    )
    const scope = q.scope ?? (hasPerm(me, 'order.all') ? 'all' : 'mine')
    const and: Prisma.OrderWhereInput[] = [{ deletedAt: null }]
    if (scope === 'all') {
      if (!hasPerm(me, 'order.all')) throw forbidden()
      and.push(scopeWhere(me) as Prisma.OrderWhereInput)
    } else and.push({ salesId: me.id })
    if (q.q) and.push({ OR: [{ orderNo: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }] })
    if (q.status) and.push({ status: q.status })
    if (q.studentId) and.push({ studentId: q.studentId })
    if (q.salesId && scope === 'all') and.push({ salesId: q.salesId })
    if (q.campusId) and.push({ campusId: q.campusId })
    if (q.packageId) and.push({ packageId: q.packageId })
    const range = dateRange(q.from, q.to)
    if (range) and.push({ signedAt: range })
    const where: Prisma.OrderWhereInput = { AND: and }
    const [items, total, groups] = await Promise.all([
      prisma.order.findMany({
        where,
        ...pageArgs(q),
        orderBy: { id: 'desc' },
        include: { student: studentLite, package: { select: { id: true, name: true } }, sales: userLite, campus: { select: { id: true, name: true } } },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['currency'],
        where: { AND: [where, { status: { not: 'CANCELLED' } }] },
        _sum: { payableAmount: true, paidAmount: true, refundedAmount: true },
      }),
    ])
    const sums: Record<string, { payable: number; paid: number; refunded: number }> = {}
    for (const g of groups)
      sums[g.currency] = { payable: g._sum.payableAmount ?? 0, paid: g._sum.paidAmount ?? 0, refunded: g._sum.refundedAmount ?? 0 }
    return { ...paged(items, total, q), scope, sums }
  })

  app.get('/:id', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const o = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        student: { select: { id: true, name: true, studentNo: true, salesId: true, campus: { select: { name: true } } } },
        package: { select: { id: true, name: true, price: true, originalPrice: true } },
        sales: userLite,
        campus: { select: { id: true, name: true } },
        items: { orderBy: { id: 'asc' } },
        payments: { orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], include: { payee: userLite } },
        refunds: { orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }], include: { operator: userLite } },
        vipPackages: {
          where: { deletedAt: null },
          select: { id: true, name: true, subject: true, totalHours: true, usedHours: true, pendingHours: true, status: true },
        },
      },
    })
    if (!o) throw notFound('订单不存在')
    const canAll = hasPerm(me, 'order.all')
    const visible = orderVisible(me, o) || (hasPerm(me, 'order.refund') && refundScopeOk(me, o.campusId))
    if (!visible) throw forbidden('无权查看该订单')
    const today = dayjs().tz(DEFAULT_TZ).format('YYYY-MM-DD')
    const active = o.status !== 'CANCELLED'
    return {
      ...o,
      payments: o.payments.map((p) => ({ ...p, deletable: canAll && fmtZoned(p.createdAt, 'YYYY-MM-DD', DEFAULT_TZ) === today })),
      access: {
        canPay: active && hasPerm(me, 'order.pay') && orderVisible(me, o),
        canRefund: active && hasPerm(me, 'order.refund') && o.paidAmount - o.refundedAmount > 0,
        canEdit: active && orderVisible(me, o) && (canAll || hasPerm(me, 'order.pay') || hasPerm(me, 'student.enroll')),
        canCancel: active && o.payments.length === 0 && orderVisible(me, o) && (canAll || hasPerm(me, 'order.pay') || hasPerm(me, 'student.enroll')),
      },
    }
  })

  /** 退费权限的校区范围：order.refund 按角色数据范围（SELF 退化为本校区） */
  function refundScopeOk(me: StaffPrincipal, campusId: number) {
    return inCampus(me, campusId)
  }

  app.put('/:id', { preHandler: perm('order.all', 'order.pay', 'student.enroll') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(
      z.object({
        note: zOptStr,
        expireAt: optDate,
        discountAmount: z.coerce.number().int('优惠金额须为整数').min(0, '优惠金额不能为负').optional(),
        discountReason: zOptStr,
      }),
      req.body,
    )
    const o = await loadOrderForAccess(me, id)
    if (o.status === 'CANCELLED') throw badRequest('订单已作废')
    const discountAmount = body.discountAmount ?? o.discountAmount
    const discountReason = body.discountReason === undefined ? o.discountReason : body.discountReason
    if (discountReason && !(DICTS.discountReasons as readonly string[]).includes(discountReason)) throw badRequest('优惠原因无效')
    if (discountAmount > 0 && !discountReason) throw badRequest('有优惠金额时请选择优惠原因')
    const items = await prisma.orderItem.findMany({ where: { orderId: id } })
    const itemSum = items.reduce((s, i) => s + i.price * i.quantity, 0)
    const payableAmount = itemSum - discountAmount
    if (payableAmount < 0) throw badRequest('优惠金额不能超过应收金额')
    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          note: body.note === undefined ? o.note : body.note,
          expireAt: body.expireAt === undefined ? o.expireAt : body.expireAt,
          discountAmount,
          discountReason: discountReason ?? null,
          payableAmount,
        },
      })
      return recalcOrder(tx, id)
    })
    await audit(req, 'update', 'Order', id, { discountAmount, payableAmount })
    return updated
  })

  app.post('/:id/cancel', { preHandler: perm('order.all', 'order.pay', 'student.enroll') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const o = await loadOrderForAccess(me, id)
    if (o.status === 'CANCELLED') throw badRequest('订单已作废')
    const nPay = await prisma.payment.count({ where: { orderId: id } })
    if (nPay > 0) throw badRequest('订单已有缴费记录，不能作废（请走退费流程）')
    const vips = await prisma.vipPackage.findMany({ where: { orderId: id, deletedAt: null } })
    if (vips.some((v) => v.usedHours > 0 || v.pendingHours > 0)) throw badRequest('该订单的 VIP 课时已有排课，请先取消排课')
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } })
      if (vips.length) await tx.vipPackage.updateMany({ where: { id: { in: vips.map((v) => v.id) } }, data: { deletedAt: new Date() } })
    })
    await audit(req, 'cancel', 'Order', id, { orderNo: o.orderNo })
    return { ok: true }
  })

  // ---------------- 缴费 ----------------
  app.post('/:id/payments', { preHandler: perm('order.pay') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(paymentBody, req.body)
    const o = await loadOrderForAccess(me, id)
    if (o.status === 'CANCELLED') throw badRequest('订单已作废，不能登记缴费')
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId: id,
          kind: body.kind,
          amount: body.amount,
          currency: o.currency,
          method: body.method,
          paidAt: body.paidAt ?? new Date(),
          payeeId: me.id,
          receiptUrl: body.receiptUrl ?? null,
          note: body.note ?? null,
        },
      })
      const order = await recalcOrder(tx, id)
      return { payment: p, order }
    })
    await audit(req, 'pay', 'Order', id, { paymentId: result.payment.id, amount: body.amount, method: body.method })
    return result
  })

  // ---------------- 退费 ----------------
  app.post('/:id/refunds', { preHandler: perm('order.refund') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(
      z.object({
        amount: z.coerce.number({ error: '请填写退费金额' }).int('金额须为整数').positive('退费金额须大于 0'),
        method: zOptStr,
        refundedAt: optDate,
        reason: zOptStr,
      }),
      req.body,
    )
    const o = await prisma.order.findFirst({ where: { id, deletedAt: null }, include: { student: { select: { salesId: true } } } })
    if (!o) throw notFound('订单不存在')
    if (!orderVisible(me, o) && !refundScopeOk(me, o.campusId)) throw forbidden('无权操作该订单')
    if (o.status === 'CANCELLED') throw badRequest('订单已作废')
    if (body.method && !PAYMENT_METHODS.includes(body.method)) throw badRequest('退费方式无效')
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await recalcOrder(tx, id)
      if (fresh.refundedAmount + body.amount > fresh.paidAmount)
        throw badRequest(`累计退费不能超过已收金额（最多还可退 ${fresh.paidAmount - fresh.refundedAmount}）`)
      const r = await tx.refund.create({
        data: {
          orderId: id,
          amount: body.amount,
          currency: o.currency,
          method: body.method ?? null,
          refundedAt: body.refundedAt ?? new Date(),
          reason: body.reason ?? null,
          operatorId: me.id,
        },
      })
      const order = await recalcOrder(tx, id)
      return { refund: r, order }
    })
    await audit(req, 'refund', 'Order', id, { refundId: result.refund.id, amount: body.amount })
    return result
  })
}
