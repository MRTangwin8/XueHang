/**
 * VIP 课时自动确认：下课 RULES.vipAutoConfirmHours 小时后仍未确认的 VIP 课次，
 * 自动确认（confirmedBy='AUTO'）并结转课时 pending → used，然后通知学生。
 * 服务启动时立即跑一次，之后每 10 分钟一次。
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { notifyStudent } from '../../lib/notify'
import { fmtZoned } from '../../lib/time'
import { RULES } from '../../dict'
import { confirmSession } from './service'

const INTERVAL_MS = 10 * 60_000

export async function autoConfirmVip(log?: FastifyInstance['log']): Promise<number> {
  // 后台「业务规则」可关闭自动确认
  if (!RULES.vipAutoConfirmEnabled) return 0
  const deadline = new Date(Date.now() - RULES.vipAutoConfirmHours * 3_600_000)
  const due = await prisma.session.findMany({
    // 规则「先填课堂记录才能确认」开启时，没有课堂记录的课次不自动确认
    where: { kind: 'VIP', status: 'SCHEDULED', endAt: { lte: deadline }, ...(RULES.vipRecordRequired ? { lessonRecord: { isNot: null } } : {}) },
    select: { id: true, startAt: true, hours: true, title: true, campus: { select: { timezone: true } }, vipPackage: { select: { studentId: true, name: true } } },
    orderBy: { endAt: 'asc' },
    take: 500,
  })
  let n = 0
  for (const s of due) {
    try {
      const ok = await prisma.$transaction((tx) => confirmSession(tx, s.id, 'AUTO'))
      if (!ok) continue
      n++
      if (s.vipPackage) {
        await notifyStudent(s.vipPackage.studentId, `VIP 课时已自动确认：${fmtZoned(s.startAt, 'MM/DD HH:mm', s.campus.timezone)} ${s.hours}h`, {
          content: `「${s.vipPackage.name}」${fmtZoned(s.startAt, 'YYYY-MM-DD HH:mm', s.campus.timezone)} 的课次已于下课 ${RULES.vipAutoConfirmHours} 小时后自动确认。`,
          link: '/portal/vip',
        })
      }
    } catch (e) {
      log?.error({ err: e, sessionId: s.id }, 'VIP 自动确认失败')
    }
  }
  if (n) log?.info(`VIP 自动确认 ${n} 节`)
  return n
}

export default function (app: FastifyInstance) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await autoConfirmVip(app.log)
    } catch (e) {
      app.log.error(e, 'VIP 自动确认任务异常')
    } finally {
      running = false
    }
  }
  void tick()
  setInterval(tick, INTERVAL_MS).unref()
}
