/**
 * 教务排课 · 业务核心
 *
 * 1. 冲突检测 findConflicts：班课 / VIP / 其他占用共用 Session 表，同教室 / 同老师 / 同一 VIP 学生 三类冲突一处判定。
 * 2. VIP 课时账本 reserve / confirm / release / adjust：只能在事务 tx 内调用。
 *      remaining = totalHours - usedHours - pendingHours
 *      先用原子 increment 改数，再回读校验 remaining ≥ 0，不足则抛错使整个事务回滚 —— 并发下也不会超扣。
 * 3. 课次状态迁移 confirmSession / cancelSession：用「带状态条件的 updateMany」抢占，
 *    同一节课被学生确认与自动确认同时触发时只有一方生效，课时只结转一次。
 */
import type { Prisma } from '../../generated/prisma/client'
import type { Principal, StaffPrincipal } from '../../plugins/auth'
import { hasPerm } from '../../plugins/auth'
import type { Tx } from '../../lib/prisma'
import { badRequest, notFound } from '../../lib/errors'
import { dayjs, DEFAULT_TZ } from '../../lib/time'

/** 浮点容差：课时最多两位小数 */
const EPS = 1e-6
export const round2 = (n: number) => Math.round(n * 100) / 100

// ============================================================
// 权限
// ============================================================

/** 教务（schedule.edit）可改全部；教师（schedule.own）只能改 teacherId = 本人 的课次 */
export function canEditSession(user: Principal | undefined, s: { teacherId: number | null }): boolean {
  if (!user || user.type !== 'staff') return false
  if (hasPerm(user, 'schedule.edit')) return true
  return hasPerm(user, 'schedule.own') && s.teacherId != null && s.teacherId === user.id
}

/** 只有 schedule.own、没有 schedule.edit 的教师 */
export function isOwnOnly(user: StaffPrincipal): boolean {
  return !hasPerm(user, 'schedule.edit') && hasPerm(user, 'schedule.own')
}

// ============================================================
// 冲突检测
// ============================================================

export interface ConflictQuery {
  roomId?: number | null
  teacherId?: number | null
  vipPackageId?: number | null
  startAt: Date
  endAt: Date
  /** 排除的课次（编辑时排除自身 / 同批一起移动的课次） */
  excludeId?: number | null
  excludeIds?: number[]
}

export type ConflictReason = 'ROOM' | 'TEACHER' | 'STUDENT'

export interface ConflictInfo {
  sessionId: number
  kind: string
  title: string
  startAt: Date
  endAt: Date
  status: string
  room: { id: number; name: string } | null
  teacher: { id: number; name: string } | null
  student: { id: number; name: string } | null
  reasons: ConflictReason[]
}

export const REASON_LABEL: Record<ConflictReason, string> = { ROOM: '教室占用', TEACHER: '老师时间冲突', STUDENT: '学生时间冲突' }

/**
 * 对每个查询项返回与之冲突的已有课次（非取消、时间重叠 a.start < b.end && b.start < a.end）。
 * 所有项合并成一次数据库查询，批量 200 条也只查一次。
 */
export async function findConflicts(tx: Tx, items: ConflictQuery[]): Promise<ConflictInfo[][]> {
  if (!items.length) return []
  // VIP 包 → 学生
  const pkgIds = [...new Set(items.map((i) => i.vipPackageId).filter((v): v is number => !!v))]
  const pkgStudent = new Map<number, number>()
  if (pkgIds.length) {
    const pkgs = await tx.vipPackage.findMany({ where: { id: { in: pkgIds } }, select: { id: true, studentId: true } })
    pkgs.forEach((p) => pkgStudent.set(p.id, p.studentId))
  }
  const roomIds = [...new Set(items.map((i) => i.roomId).filter((v): v is number => !!v))]
  const teacherIds = [...new Set(items.map((i) => i.teacherId).filter((v): v is number => !!v))]
  const studentIds = [...new Set([...pkgStudent.values()])]
  const or: Prisma.SessionWhereInput[] = []
  if (roomIds.length) or.push({ roomId: { in: roomIds } })
  if (teacherIds.length) or.push({ teacherId: { in: teacherIds } })
  if (studentIds.length) or.push({ vipPackage: { studentId: { in: studentIds } } })
  if (!or.length) return items.map(() => [])

  const minStart = new Date(Math.min(...items.map((i) => i.startAt.getTime())))
  const maxEnd = new Date(Math.max(...items.map((i) => i.endAt.getTime())))
  const existing = await tx.session.findMany({
    where: { status: { not: 'CANCELLED' }, startAt: { lt: maxEnd }, endAt: { gt: minStart }, OR: or },
    select: {
      id: true, kind: true, title: true, startAt: true, endAt: true, status: true, roomId: true, teacherId: true,
      room: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      vipPackage: { select: { studentId: true, student: { select: { id: true, name: true } } } },
    },
    orderBy: { startAt: 'asc' },
  })

  return items.map((it) => {
    const exclude = new Set<number>([...(it.excludeIds ?? []), ...(it.excludeId ? [it.excludeId] : [])])
    const sid = it.vipPackageId ? pkgStudent.get(it.vipPackageId) : undefined
    const out: ConflictInfo[] = []
    for (const s of existing) {
      if (exclude.has(s.id)) continue
      if (!(s.startAt < it.endAt && it.startAt < s.endAt)) continue
      const reasons: ConflictReason[] = []
      if (it.roomId && s.roomId === it.roomId) reasons.push('ROOM')
      if (it.teacherId && s.teacherId === it.teacherId) reasons.push('TEACHER')
      if (sid && s.vipPackage?.studentId === sid) reasons.push('STUDENT')
      if (!reasons.length) continue
      out.push({
        sessionId: s.id, kind: s.kind, title: s.title, startAt: s.startAt, endAt: s.endAt, status: s.status,
        room: s.room, teacher: s.teacher, student: s.vipPackage?.student ?? null, reasons,
      })
    }
    return out
  })
}

// ============================================================
// VIP 课时账本（只能在事务内调用）
// ============================================================

type PkgNums = { id: number; totalHours: number; usedHours: number; pendingHours: number }
export const remainingOf = (p: Pick<PkgNums, 'totalHours' | 'usedHours' | 'pendingHours'>) => round2(p.totalHours - p.usedHours - p.pendingHours)

async function assertLedger(tx: Tx, id: number, checkRemaining = false) {
  const p = await tx.vipPackage.findUniqueOrThrow({ where: { id } })
  if (p.pendingHours < -EPS || p.usedHours < -EPS) throw badRequest('课时账本异常（待确认 / 已确认出现负数），操作已回滚')
  if (checkRemaining && remainingOf(p) < -EPS) throw badRequest(`剩余课时不足（${p.name}），操作已回滚`)
  return p
}

async function assertEnough(tx: Tx, id: number, need: number) {
  const p = await tx.vipPackage.findUniqueOrThrow({ where: { id } })
  const left = remainingOf(p)
  if (left + EPS < need) throw badRequest(`剩余课时不足：「${p.name}」剩余 ${left}h，本次需要 ${round2(need)}h`)
}

/** 加载可约课的课时包（未删除、在读） */
export async function loadBookablePackage(tx: Tx, id: number) {
  const p = await tx.vipPackage.findFirst({ where: { id, deletedAt: null }, include: { teachers: true, student: { select: { id: true, name: true, campusId: true } } } })
  if (!p) throw notFound('VIP 课时包不存在')
  if (p.status !== 'ACTIVE') throw badRequest('该 VIP 课时包已结业，不能再约课')
  return p
}

/** 约课：剩余 → 待确认 */
export async function reserveHours(tx: Tx, vipPackageId: number, hours: number) {
  if (hours <= 0) return
  await assertEnough(tx, vipPackageId, hours)
  await tx.vipPackage.update({ where: { id: vipPackageId }, data: { pendingHours: { increment: hours } } })
  await assertLedger(tx, vipPackageId, true) // 原子加后回读：并发约课也不会超扣
}

/** 确认：待确认 → 已确认 */
export async function confirmHours(tx: Tx, vipPackageId: number, hours: number) {
  if (hours <= 0) return
  await tx.vipPackage.update({ where: { id: vipPackageId }, data: { pendingHours: { decrement: hours }, usedHours: { increment: hours } } })
  await assertLedger(tx, vipPackageId)
}

/** 退回：待确认 / 已确认 → 剩余 */
export async function releaseHours(tx: Tx, vipPackageId: number, hours: number, from: 'pending' | 'used') {
  if (hours <= 0) return
  await tx.vipPackage.update({
    where: { id: vipPackageId },
    data: from === 'pending' ? { pendingHours: { decrement: hours } } : { usedHours: { decrement: hours } },
  })
  await assertLedger(tx, vipPackageId)
}

/** 修改课次课时：delta 可正可负，记入 pending（待确认课次）或 used（已确认课次） */
export async function adjustHours(tx: Tx, vipPackageId: number, delta: number, bucket: 'pending' | 'used') {
  if (Math.abs(delta) < EPS) return
  if (delta > 0) await assertEnough(tx, vipPackageId, delta)
  await tx.vipPackage.update({
    where: { id: vipPackageId },
    data: bucket === 'pending' ? { pendingHours: { increment: delta } } : { usedHours: { increment: delta } },
  })
  await assertLedger(tx, vipPackageId, delta > 0)
}

// ============================================================
// 课次状态迁移
// ============================================================

/**
 * 确认课次：SCHEDULED → CONFIRMED，VIP 同步 pending → used。
 * 返回 false 表示该课次已不是 SCHEDULED（被别人抢先确认 / 取消），不做任何改动。
 */
export async function confirmSession(tx: Tx, sessionId: number, by: 'STUDENT' | 'AUTO' | 'STAFF'): Promise<boolean> {
  const r = await tx.session.updateMany({
    where: { id: sessionId, status: 'SCHEDULED' },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: by },
  })
  if (r.count === 0) return false
  const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId }, select: { kind: true, vipPackageId: true, hours: true } })
  if (s.kind === 'VIP' && s.vipPackageId) await confirmHours(tx, s.vipPackageId, s.hours)
  return true
}

/**
 * 取消课次：SCHEDULED 的 VIP 退回 pending，CONFIRMED 的退回 used。
 * expectStatus 用于并发保护：只有当前状态仍是读取时的状态才会取消。
 */
export async function cancelSession(tx: Tx, sessionId: number, expectStatus: 'SCHEDULED' | 'CONFIRMED', reason?: string | null): Promise<boolean> {
  const cur = await tx.session.findUniqueOrThrow({ where: { id: sessionId }, select: { kind: true, vipPackageId: true, hours: true, note: true } })
  const note = reason ? [cur.note, `【取消】${reason}`].filter(Boolean).join('\n') : cur.note
  const r = await tx.session.updateMany({ where: { id: sessionId, status: expectStatus }, data: { status: 'CANCELLED', note } })
  if (r.count === 0) return false
  if (cur.kind === 'VIP' && cur.vipPackageId) await releaseHours(tx, cur.vipPackageId, cur.hours, expectStatus === 'CONFIRMED' ? 'used' : 'pending')
  return true
}

// ============================================================
// 时间工具
// ============================================================

export const zHHmm = /^([01]\d|2[0-3]):[0-5]\d$/
export const zYmd = /^\d{4}-\d{2}-\d{2}$/

/** 校区时区 */
export async function campusTz(tx: Tx, campusId: number): Promise<string> {
  const c = await tx.campus.findFirst({ where: { id: campusId, deletedAt: null }, select: { timezone: true } })
  if (!c) throw badRequest('校区不存在')
  return c.timezone || DEFAULT_TZ
}

/** 校区时区下的 YYYY-MM-DD + HH:mm → UTC Date */
export function zoned(date: string, time: string, tz: string): Date {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', tz).toDate()
}

export function localParts(d: Date, tz: string) {
  const z = dayjs(d).tz(tz)
  return { date: z.format('YYYY-MM-DD'), time: z.format('HH:mm'), weekday: z.isoWeekday() }
}

/** 按日期区间 + 星期展开批量排课的日期（与时区无关的纯日期运算） */
export function expandDates(startDate: string, endDate: string, weekdays: number[]): { date: string; weekday: number }[] {
  const out: { date: string; weekday: number }[] = []
  const wd = new Set(weekdays)
  let d = dayjs.utc(startDate, 'YYYY-MM-DD')
  const end = dayjs.utc(endDate, 'YYYY-MM-DD')
  while (!d.isAfter(end)) {
    const w = d.isoWeekday()
    if (wd.has(w)) out.push({ date: d.format('YYYY-MM-DD'), weekday: w })
    d = d.add(1, 'day')
  }
  return out
}

export const durationHours = (startAt: Date, endAt: Date) => round2((endAt.getTime() - startAt.getTime()) / 3_600_000)

/** 时间段校验：结束晚于开始，单节不超过 12 小时 */
export function assertRange(startAt: Date, endAt: Date) {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw badRequest('时间格式错误')
  if (endAt <= startAt) throw badRequest('结束时间必须晚于开始时间')
  if (endAt.getTime() - startAt.getTime() > 12 * 3_600_000) throw badRequest('单节课次不能超过 12 小时')
}
