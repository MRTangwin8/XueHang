import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../../lib/prisma'
import { DEFAULT_TZ, dayjs } from '../../lib/time'
import { uploadPath } from '../../lib/upload'
import { badRequest } from '../../lib/errors'
import { RULES } from '../../dict'

/** 校区时区（带缓存） */
const tzCache = new Map<number, string>()
export async function campusTz(campusId?: number | null): Promise<string> {
  if (!campusId) return DEFAULT_TZ
  const hit = tzCache.get(campusId)
  if (hit) return hit
  const c = await prisma.campus.findUnique({ where: { id: campusId }, select: { timezone: true } })
  const tz = c?.timezone || DEFAULT_TZ
  tzCache.set(campusId, tz)
  return tz
}

/** 月份 YYYY-MM → [start, end) UTC */
export function monthRange(month: string, tz = DEFAULT_TZ): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('月份格式应为 YYYY-MM')
  const s = dayjs.tz(`${month}-01 00:00`, 'YYYY-MM-DD HH:mm', tz)
  return { start: s.toDate(), end: s.add(1, 'month').toDate() }
}

/** 当前月份 YYYY-MM（业务时区） */
export const currentMonth = (tz = DEFAULT_TZ) => dayjs().tz(tz).format('YYYY-MM')

/** 业务时区某天 [00:00, 次日 00:00) */
export function dayRange(d: Date = new Date(), tz = DEFAULT_TZ): { start: Date; end: Date } {
  const s = dayjs(d).tz(tz).startOf('day')
  return { start: s.toDate(), end: s.add(1, 'day').toDate() }
}

/** 日期区间过滤（from/to 为日期，to 含当天） */
export function dateFilter(from?: Date, to?: Date, tz = DEFAULT_TZ) {
  if (!from && !to) return undefined
  const f: { gte?: Date; lt?: Date } = {}
  if (from) f.gte = dayjs(from).tz(tz).startOf('day').toDate()
  if (to) f.lt = dayjs(to).tz(tz).startOf('day').add(1, 'day').toDate()
  return f
}

/**
 * 资料打印领取时间：
 * 校区时区 12:00 之前提交 → 当天 17:00；12:00 及之后 → 次日 17:00。
 */
export function computePrintReadyAt(submittedAt: Date, tz = DEFAULT_TZ): Date {
  const local = dayjs(submittedAt).tz(tz)
  const date = local.format('YYYY-MM-DD')
  const cutoff = dayjs.tz(`${date} ${RULES.printCutoff}`, 'YYYY-MM-DD HH:mm', tz)
  const readyDay = local.isBefore(cutoff) ? date : cutoff.add(1, 'day').format('YYYY-MM-DD')
  return dayjs.tz(`${readyDay} ${RULES.printReadyTime}`, 'YYYY-MM-DD HH:mm', tz).toDate()
}

export const printUnitPrice = (colorMode: string) => (colorMode === 'COLOR' ? RULES.printPriceColor : RULES.printPriceBW)

/** 统计 PDF 页数：读取文件并计数 /Type /Page（排除 /Pages）；读不到返回 null */
export async function countPdfPages(fileUrl: string): Promise<number | null> {
  try {
    const buf = await readFile(uploadPath(fileUrl))
    const text = buf.toString('latin1')
    const n = (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
    return n > 0 ? n : null
  } catch {
    return null
  }
}

export const extOf = (name: string) => path.extname(name || '').toLowerCase()

/** 上传文件 url 必须来自 /uploads/ */
export function assertUploadUrl(url: string) {
  if (!/^\/uploads\/[\w\-/.]+$/.test(url) || url.includes('..')) throw badRequest('文件地址无效，请重新上传')
}

/**
 * 公告正文一律存为纯文本：粘贴进来的 HTML 转为文字（段落 / 换行保留），其余标签全部去掉。
 * 前端渲染时始终先转义再排版（renderContent），因此即使库里残留 HTML 也不会执行。
 * （不再使用黑名单式 HTML 清洗——那种方式容易被 <svg/onload> 等写法绕过。）
 */
export function toPlainText(input: string): string {
  const text = input.replace(/\r\n?/g, '\n')
  if (!/<\/?[a-z!][\s\S]*?>/i.test(text)) return text.trim()
  return text
    .replace(/<\s*(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|blockquote|section|article)\s*>/gi, '\n')
    .replace(/<[^>]*>?/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
