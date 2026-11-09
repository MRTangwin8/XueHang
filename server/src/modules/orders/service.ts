import { RULES } from '../../dict'
import { prisma, type Tx } from '../../lib/prisma'
import { forbidden, notFound } from '../../lib/errors'
import { dayjs, DEFAULT_TZ } from '../../lib/time'
import { hasPerm, inCampus, scopeWhere, type StaffPrincipal } from '../../plugins/auth'

/** 订单号 SO{YYYY}{6位序号} */
export async function nextOrderNo(tx: Tx | typeof prisma = prisma): Promise<string> {
  const prefix = `${RULES.orderNoPrefix}${dayjs().tz(DEFAULT_TZ).format('YYYY')}`
  const rows = await tx.order.findMany({ where: { orderNo: { startsWith: prefix } }, select: { orderNo: true } })
  let max = 0
  for (const r of rows) {
    const n = Number(r.orderNo.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`
}

/** 按缴费 / 退费重算 paidAmount、refundedAmount 与状态（作废单保持作废） */
export async function recalcOrder(tx: Tx, orderId: number) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
  const [pay, ref] = await Promise.all([
    tx.payment.aggregate({ where: { orderId }, _sum: { amount: true } }),
    tx.refund.aggregate({ where: { orderId }, _sum: { amount: true } }),
  ])
  const paid = pay._sum.amount ?? 0
  const refunded = ref._sum.amount ?? 0
  let status = o.status
  if (o.status !== 'CANCELLED') {
    if (paid > 0 && refunded >= paid) status = 'REFUNDED'
    else if (paid >= o.payableAmount && (paid > 0 || o.payableAmount === 0)) status = 'PAID'
    else if (paid > 0) status = 'PARTIAL'
    else status = 'UNPAID'
  }
  return tx.order.update({ where: { id: orderId }, data: { paidAmount: paid, refundedAmount: refunded, status } })
}

type OrderLite = { id: number; campusId: number; salesId: number | null; student?: { salesId: number | null } | null }

/** 订单可见：order.all（校区范围内）或 本人销售 / 该生销售（order.view） */
export function orderVisible(me: StaffPrincipal, o: OrderLite) {
  if (hasPerm(me, 'order.all')) {
    if (inCampus(me, o.campusId)) return true
  }
  if (hasPerm(me, 'order.view') || hasPerm(me, 'order.pay') || hasPerm(me, 'student.enroll')) {
    if (o.salesId === me.id || o.student?.salesId === me.id) return true
  }
  return false
}

export async function loadOrderForAccess(me: StaffPrincipal, id: number) {
  const o = await prisma.order.findFirst({ where: { id, deletedAt: null }, include: { student: { select: { salesId: true } } } })
  if (!o) throw notFound('订单不存在')
  if (!orderVisible(me, o)) throw forbidden('无权操作该订单')
  return o
}

/** 订单类列表的数据范围：order.all → 校区范围；否则仅本人 */
export function orderScope(me: StaffPrincipal, selfField: 'salesId' | 'payeeId' = 'salesId') {
  if (hasPerm(me, 'order.all')) return { kind: 'all' as const, where: scopeWhere(me) as Record<string, unknown> }
  return { kind: 'self' as const, field: selfField }
}
