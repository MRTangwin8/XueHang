/**
 * 课表导出为图片（PNG）：直接用 Canvas 绘制，不依赖第三方截图库。
 * 版面：标题 + 日期范围，下面每周一行、七列（周一至周日），每格列出当天的课次。
 * 标题、页脚、是否显示老师 / 教室由「业务规则 → 课表导出」配置。
 */
import type { TimetableItem } from './api'

export interface ExportOptions {
  title: string
  subtitle: string
  footer?: string
  /** 页脚右侧的小字（机构名称） */
  brand?: string
  /** 连续的日期（YYYY-MM-DD），长度为 7 的倍数，从周一开始 */
  days: string[]
  weekdayLabels: string[]
  /** 图例里「班课」的名称 */
  classLabel: string
  items: TimetableItem[]
  dateOf: (iso: string) => string
  timeRange: (s: TimetableItem) => string
  showTeacher: boolean
  showRoom: boolean
  cancelledLabel: string
  emptyLabel: string
  /** 月视图：只高亮这个月份（YYYY-MM）的日期 */
  month?: string
  fileName: string
}

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif'
const COLORS = {
  CLASS: { bg: '#eef2ff', bar: '#4f46e5', text: '#3730a3' },
  VIP: { bg: '#fef3c7', bar: '#d97706', text: '#92400e' },
} as const

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function renderTimetable(o: ExportOptions): HTMLCanvasElement {
  const weeks = Math.ceil(o.days.length / 7)
  const compact = weeks > 1
  const W = 1400
  const PAD = 40
  const colW = (W - PAD * 2) / 7
  const metaLines = (s: TimetableItem) => {
    const lines: string[] = []
    const where = [s.room?.building, s.room?.name].filter(Boolean).join(' · ')
    if (o.showRoom && where) lines.push(where)
    if (o.showTeacher && s.teacher) lines.push(s.teacher.name)
    return compact ? (lines.length ? [lines.join(' · ')] : []) : lines
  }
  const LINE = compact ? 17 : 20
  const cardH = (s: TimetableItem) => 12 + LINE * (2 + metaLines(s).length)
  const GAP = 6
  const byDay = new Map<string, TimetableItem[]>()
  for (const s of o.items) {
    const d = o.dateOf(s.startAt)
    if (o.days.includes(d)) byDay.set(d, [...(byDay.get(d) ?? []), s])
  }
  const HEAD = 40
  const rowH: number[] = []
  for (let w = 0; w < weeks; w++) {
    let max = compact ? 46 : 120
    for (let i = 0; i < 7; i++) {
      const list = byDay.get(o.days[w * 7 + i]) ?? []
      const h = list.reduce((a, s) => a + cardH(s) + GAP, 0) + 10
      max = Math.max(max, h)
    }
    rowH.push(max)
  }
  const TOP = 118
  const FOOT = o.footer || o.brand ? 56 : 24
  const H = TOP + rowH.reduce((a, h) => a + h + HEAD, 0) + FOOT
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'

  // 标题
  ctx.fillStyle = '#0f172a'
  ctx.font = `700 30px ${FONT}`
  ctx.fillText(fit(ctx, o.title, W - PAD * 2), PAD, 52)
  ctx.fillStyle = '#64748b'
  ctx.font = `400 16px ${FONT}`
  ctx.fillText(o.subtitle, PAD, 88)
  // 图例
  let lx = W - PAD
  ctx.font = `400 14px ${FONT}`
  for (const [k, label] of [['VIP', 'VIP'], ['CLASS', o.classLabel]] as const) {
    if (!label) continue
    const tw = ctx.measureText(label).width
    lx -= tw
    ctx.fillStyle = '#475569'
    ctx.fillText(label, lx, 88)
    lx -= 18
    ctx.fillStyle = COLORS[k].bar
    roundRect(ctx, lx, 82, 12, 12, 3)
    ctx.fill()
    lx -= 18
  }

  let y = TOP
  for (let w = 0; w < weeks; w++) {
    // 表头
    for (let i = 0; i < 7; i++) {
      const d = o.days[w * 7 + i]
      const x = PAD + i * colW
      const dim = !!o.month && d.slice(0, 7) !== o.month
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(x, y, colW, HEAD)
      ctx.fillStyle = dim ? '#cbd5e1' : '#334155'
      ctx.font = `600 14px ${FONT}`
      ctx.fillText(`${o.weekdayLabels[i]}  ${d.slice(5)}`, x + 10, y + HEAD / 2)
    }
    const bodyY = y + HEAD
    for (let i = 0; i < 7; i++) {
      const d = o.days[w * 7 + i]
      const x = PAD + i * colW
      const list = byDay.get(d) ?? []
      let cy = bodyY + 8
      if (!list.length && !compact) {
        ctx.fillStyle = '#cbd5e1'
        ctx.font = `400 14px ${FONT}`
        ctx.fillText(o.emptyLabel, x + 10, cy + 12)
      }
      for (const s of list) {
        const c = COLORS[s.kind] ?? COLORS.CLASS
        const cancelled = s.status === 'CANCELLED'
        const h = cardH(s)
        const cw = colW - 12
        ctx.globalAlpha = cancelled ? 0.5 : 1
        ctx.fillStyle = c.bg
        roundRect(ctx, x + 6, cy, cw, h, 6)
        ctx.fill()
        ctx.fillStyle = c.bar
        ctx.fillRect(x + 6, cy + 4, 3, h - 8)
        let ty = cy + 6 + LINE / 2
        ctx.fillStyle = c.text
        ctx.font = `600 ${compact ? 12 : 13}px ${FONT}`
        ctx.fillText(fit(ctx, o.timeRange(s) + (cancelled ? ` · ${o.cancelledLabel}` : ''), cw - 20), x + 16, ty)
        ty += LINE
        ctx.fillStyle = '#0f172a'
        ctx.font = `600 ${compact ? 13 : 14}px ${FONT}`
        ctx.fillText(fit(ctx, s.title, cw - 20), x + 16, ty)
        ctx.fillStyle = '#64748b'
        ctx.font = `400 ${compact ? 11 : 12}px ${FONT}`
        for (const line of metaLines(s)) {
          ty += LINE
          ctx.fillText(fit(ctx, line, cw - 20), x + 16, ty)
        }
        ctx.globalAlpha = 1
        cy += h + GAP
      }
    }
    // 网格线
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.strokeRect(PAD + 0.5, y + 0.5, W - PAD * 2 - 1, HEAD + rowH[w])
    for (let i = 1; i < 7; i++) {
      ctx.beginPath()
      ctx.moveTo(PAD + i * colW + 0.5, y)
      ctx.lineTo(PAD + i * colW + 0.5, y + HEAD + rowH[w])
      ctx.stroke()
    }
    y += HEAD + rowH[w]
  }

  if (o.footer || o.brand) {
    ctx.font = `400 13px ${FONT}`
    ctx.fillStyle = '#64748b'
    if (o.footer) ctx.fillText(fit(ctx, o.footer, W - PAD * 2 - 260), PAD, y + 30)
    if (o.brand) {
      ctx.fillStyle = '#94a3b8'
      const tw = ctx.measureText(o.brand).width
      ctx.fillText(o.brand, W - PAD - tw, y + 30)
    }
  }
  return canvas
}

export async function downloadTimetable(o: ExportOptions): Promise<void> {
  const canvas = renderTimetable(o)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('export failed')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = o.fileName.replace(/[\\/:*?"<>|]/g, '_') + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
