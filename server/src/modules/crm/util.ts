import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { dayjs, DEFAULT_TZ, zonedDateTime } from '../../lib/time'
import { campusLimit as sharedCampusLimit, type StaffPrincipal } from '../../plugins/auth'

export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
/** 查询串布尔：1 / true → true */
export const zFlag = z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean())
export const zOptDay = z.preprocess((v) => (v === '' || v == null ? undefined : v), zDay.optional())
export const zOptId = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().optional())

/** 校区时区今天 YYYY-MM-DD */
export const todayStr = () => dayjs().tz(DEFAULT_TZ).format('YYYY-MM-DD')

/** 日期区间 [from 00:00, to+1 00:00)（校区时区），返回 Prisma DateTime 过滤 */
export function dayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined
  const r: Prisma.DateTimeFilter = {}
  if (from) r.gte = zonedDateTime(from, '00:00')
  if (to) r.lt = dayjs(zonedDateTime(to, '00:00')).add(1, 'day').toDate()
  return r
}

/** 统计用区间，默认本月 1 日 ~ 今天 */
export function statRange(from?: string, to?: string) {
  const t = todayStr()
  const f = from || dayjs().tz(DEFAULT_TZ).startOf('month').format('YYYY-MM-DD')
  const e = to || t
  const gte = zonedDateTime(f, '00:00')
  const lt = dayjs(zonedDateTime(e, '00:00')).add(1, 'day').toDate()
  return { from: f, to: e, gte, lt }
}

export const isSuper = (me: StaffPrincipal) => me.perms.includes('*')
export const can = (me: StaffPrincipal, code: string) => isSuper(me) || me.perms.includes(code)

/** 校区数据范围（与 scopeWhere 一致的校区部分，但不因 allPerm 放开）：ALL / * 不限，其他限本校区 */
export function campusLimit(me: StaffPrincipal): number[] | null {
  return sharedCampusLimit(me)
}

type CustomerLite = { id: number; ownerId: number | null; campusId: number; deletedAt: Date | null }

/** 是否可查看客户：本人名下 / 公海且有 crm.pool / 有 crm.customer.all（受校区范围约束） */
export function canViewCustomer(me: StaffPrincipal, c: CustomerLite) {
  if (c.ownerId === me.id) return true
  if (can(me, 'crm.customer.all')) {
    const lim = campusLimit(me)
    return lim == null || lim.includes(c.campusId)
  }
  // 公海客户同样受校区范围约束
  if (c.ownerId == null && can(me, 'crm.pool')) {
    const lim = campusLimit(me)
    return lim == null || lim.includes(c.campusId)
  }
  return false
}

/** 是否可修改客户：本人名下，或有 crm.customer.all */
export function canEditCustomer(me: StaffPrincipal, c: CustomerLite) {
  if (c.ownerId === me.id) return true
  return can(me, 'crm.customer.all') && canViewCustomer(me, c)
}

export async function loadCustomer(id: number, opts: { withDeleted?: boolean } = {}) {
  const c = await prisma.customer.findUnique({ where: { id } })
  if (!c || (!opts.withDeleted && c.deletedAt)) throw notFound('客户不存在')
  return c
}

export async function editableCustomer(me: StaffPrincipal, id: number) {
  const c = await loadCustomer(id)
  if (!canEditCustomer(me, c)) throw forbidden('只能修改自己名下的客户')
  return c
}
