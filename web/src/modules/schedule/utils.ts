import { currentLocale, t } from '@/i18n'
import { dayjs, tz, fmtTime } from '@/utils/time'
import type { ConflictReason, SessionKind } from './api'

export const KIND_LABEL: Record<SessionKind, string> = {
  get CLASS() { return t('schedule.groupClass') },
  VIP: 'VIP',
  get OTHER() { return t('schedule.otherBooking') },
}
export const REASON_LABEL: Record<ConflictReason, string> = {
  get ROOM() { return t('schedule.roomOccupied') },
  get TEACHER() { return t('schedule.teacherConflict') },
  get STUDENT() { return t('schedule.studentConflict') },
}
export const CONFIRMED_BY: Record<string, string> = {
  get STUDENT() { return t('schedule.confirmedByStudent') },
  get AUTO() { return t('schedule.automaticallyConfirmed') },
  get STAFF() { return t('schedule.confirmedByAcademicStaff') },
}

/** 课次色块的 CSS 变量（--xh-kind-*） */
export function kindStyle(kind: SessionKind | string) {
  const k = kind === 'CLASS' ? 'class' : kind === 'VIP' ? 'vip' : 'other'
  return { '--c': `var(--xh-kind-${k})`, '--bg': `var(--xh-kind-${k}-bg)` } as Record<string, string>
}

/** 时段 HH:mm–HH:mm */
export const timeRange = (s: { startAt: string; endAt: string }) => `${fmtTime(s.startAt)}–${fmtTime(s.endAt)}`

/** 业务时区下自当天 00:00 起的分钟数 */
export function minutesOfDay(iso: string) {
  const d = tz(iso)
  return d.hour() * 60 + d.minute()
}

export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 某日所在 ISO 周的周一 YYYY-MM-DD */
export const mondayOf = (date: string) => dayjs(date).isoWeekday(1).format('YYYY-MM-DD')

export const addDays = (date: string, n: number) => dayjs(date).add(n, 'day').format('YYYY-MM-DD')

/** 课次在业务时区的日期 YYYY-MM-DD */
export const dateOf = (iso: string) => tz(iso).format('YYYY-MM-DD')

/** 时刻选项（07:00–23:00，15 分钟） */
export const TIME_OPTS = { start: '07:00', end: '23:00', step: '00:15' }

/** HH:mm 差值（小时，保留两位） */
export function diffHours(start?: string | null, end?: string | null) {
  if (!start || !end) return 0
  const [a, b] = [start, end].map((t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })
  return Math.max(0, Math.round(((b - a) / 60) * 100) / 100)
}

/** 把一组课次按重叠关系分配泳道，返回 id → lane 以及总泳道数 */
export function assignLanes<T extends { id: number; startAt: string; endAt: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startAt.localeCompare(b.startAt) || b.endAt.localeCompare(a.endAt))
  const laneEnds: string[] = []
  const lane = new Map<number, number>()
  for (const s of sorted) {
    let i = laneEnds.findIndex((end) => end <= s.startAt)
    if (i === -1) {
      i = laneEnds.length
      laneEnds.push(s.endAt)
    } else laneEnds[i] = s.endAt
    lane.set(s.id, i)
  }
  return { lane, count: Math.max(1, laneEnds.length) }
}

/** 解析 409 冲突响应 */
export function conflictDetails(e: unknown): { message: string; details: unknown } | null {
  const r = (e as { response?: { status?: number; data?: { message?: string; details?: unknown } } })?.response
  if (r?.status !== 409) return null
  return { message: r.data?.message ?? t('schedule.schedulingConflict'), details: r.data?.details }
}

/** 非 409 错误的提示文案 */
export const errorMessage = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (e as Error)?.message ??
  t('schedule.operationFailed')

/**
 * 日内列布局：重叠的课次分成簇，簇内分泳道并均分宽度；互不重叠的课次占满整列。
 * 返回 id → { lane, lanes }
 */
export function layoutColumns<T extends { id: number; startAt: string; endAt: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startAt.localeCompare(b.startAt) || b.endAt.localeCompare(a.endAt))
  const out = new Map<number, { lane: number; lanes: number }>()
  let cluster: T[] = []
  let clusterEnd = ''
  const flush = () => {
    const { lane, count } = assignLanes(cluster)
    cluster.forEach((s) => out.set(s.id, { lane: lane.get(s.id)!, lanes: count }))
    cluster = []
  }
  for (const s of sorted) {
    if (cluster.length && s.startAt >= clusterEnd) flush()
    cluster.push(s)
    if (cluster.length === 1 || s.endAt > clusterEnd) clusterEnd = s.endAt
  }
  if (cluster.length) flush()
  return out
}

/** Localized ISO weekdays, preserving the existing Chinese labels. */
export const weekdayLabel = (n: number, compact = false) => {
  const keys = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const label = keys[n] ? t(`schedule.weekdays.${keys[n]}`) : ''
  return compact && currentLocale() === 'zh-CN' ? label.slice(1) : label
}
