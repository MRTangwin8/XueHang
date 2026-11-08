/**
 * 公海自动回收：开启后，每小时把「超过 N 天没有跟进」的客户退回公海，并提醒原负责人。
 * 只处理 新客户 / 跟进中、且未转为学员的客户。以最近跟进时间为准；从未跟进的以分配时间（或创建时间）为准。
 * 开关与天数见「业务规则 → 客户公海」。
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { notifyUser } from '../../lib/notify'
import { RULES } from '../../dict'

export async function recycleIdleCustomers(log?: FastifyInstance['log']): Promise<number> {
  if (!RULES.customerRecycleEnabled) return 0
  const cutoff = new Date(Date.now() - RULES.customerRecycleDays * 86_400_000)
  const idle = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      ownerId: { not: null },
      studentId: null,
      status: { in: ['NEW', 'FOLLOWING'] },
      OR: [
        { lastFollowAt: { lt: cutoff } },
        { lastFollowAt: null, assignedAt: { lt: cutoff } },
        { lastFollowAt: null, assignedAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, name: true, ownerId: true },
    take: 500,
  })
  if (!idle.length) return 0
  // 条件更新：期间若有新的跟进 / 被重新分配则不回收
  const r = await prisma.customer.updateMany({
    where: { id: { in: idle.map((c) => c.id) }, ownerId: { not: null }, OR: [{ lastFollowAt: null }, { lastFollowAt: { lt: cutoff } }] },
    data: { ownerId: null, assignedAt: null },
  })
  const byOwner = new Map<number, string[]>()
  for (const c of idle) byOwner.set(c.ownerId!, [...(byOwner.get(c.ownerId!) ?? []), c.name])
  for (const [ownerId, names] of byOwner) {
    await notifyUser(ownerId, `${names.length} 位客户超过 ${RULES.customerRecycleDays} 天未跟进，已退回公海`, {
      content: names.slice(0, 20).join('、'),
      link: '/crm/pool',
    })
  }
  await prisma.operationLog.create({
    data: { action: 'recycle', entity: 'Customer', entityId: idle.map((c) => c.id).join(',').slice(0, 180), detail: JSON.stringify({ count: r.count, days: RULES.customerRecycleDays }) },
  })
  log?.info({ count: r.count }, '公海自动回收')
  return r.count
}

export default function start(app: FastifyInstance) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await recycleIdleCustomers(app.log)
    } catch (e) {
      app.log.error(e, '公海自动回收任务异常')
    } finally {
      running = false
    }
  }
  void tick()
  setInterval(tick, 60 * 60_000).unref()
}
