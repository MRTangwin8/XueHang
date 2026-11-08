import type { FastifyInstance } from 'fastify'
import customers from './customers'
import partners from './partners'
import daily from './daily'
import stats from './stats'

/**
 * 客户管理 CRM：/api/crm
 * - customers.ts  客户 / 公海 / 跟进
 * - partners.ts   渠道 / 合作机构 / 机构跟进
 * - daily.ts      我的日报 / 业务日报
 * - stats.ts      报表统计 / 业绩排行
 */
export default async function (app: FastifyInstance) {
  await customers(app)
  await partners(app)
  await daily(app)
  await stats(app)
}
