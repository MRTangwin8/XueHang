import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

/** 默认业务时区（校区可覆盖 Campus.timezone） */
export const DEFAULT_TZ = 'Asia/Tokyo'

export { dayjs }

/** 把「校区时区的日期 + 时刻」转为 UTC Date。date=YYYY-MM-DD, time=HH:mm */
export function zonedDateTime(date: string, time: string, tz = DEFAULT_TZ): Date {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', tz).toDate()
}

/** 校区时区下某天 00:00 的 UTC Date */
export function startOfZonedDay(d: Date | string, tz = DEFAULT_TZ): Date {
  return dayjs(d).tz(tz).startOf('day').toDate()
}

/** 格式化为校区时区字符串 */
export function fmtZoned(d: Date, fmt = 'YYYY-MM-DD HH:mm', tz = DEFAULT_TZ): string {
  return dayjs(d).tz(tz).format(fmt)
}

/** ISO 星期：1=周一 … 7=周日 */
export function isoWeekday(date: string, tz = DEFAULT_TZ): number {
  return dayjs.tz(date, 'YYYY-MM-DD', tz).isoWeekday()
}
