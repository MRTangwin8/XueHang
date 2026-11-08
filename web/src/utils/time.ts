import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/zh-cn'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)
dayjs.locale('zh-cn')

/**
 * 业务时区：所有时间按校区时区（默认东京）显示，与浏览器所在时区无关。
 * 后端返回 ISO UTC 字符串；向后端提交日期+时刻时用 toApi()。
 */
export const TZ = 'Asia/Tokyo'

export { dayjs }

/** 解析为业务时区的 dayjs 对象 */
export const tz = (d?: string | Date | number | null) => (d == null ? dayjs().tz(TZ) : dayjs(d).tz(TZ))

export const fmtDate = (d?: string | Date | null) => (d ? tz(d).format('YYYY-MM-DD') : '')
export const fmtDateTime = (d?: string | Date | null) => (d ? tz(d).format('YYYY-MM-DD HH:mm') : '')
export const fmtTime = (d?: string | Date | null) => (d ? tz(d).format('HH:mm') : '')
export const fmtMonthDay = (d?: string | Date | null) => (d ? tz(d).format('MM/DD ddd') : '')

/** 把业务时区的 "YYYY-MM-DD" + "HH:mm" 转为 ISO UTC 字符串提交给后端 */
export function toApi(date: string, time = '00:00'): string {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TZ).toISOString()
}

/** 业务时区今天 YYYY-MM-DD */
export const today = () => tz().format('YYYY-MM-DD')

const WEEK = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
/** ISO 星期中文：1=周一 … 7=周日 */
export const weekdayLabel = (n: number) => WEEK[n] ?? ''
