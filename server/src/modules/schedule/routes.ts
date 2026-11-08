import type { FastifyInstance } from 'fastify'
import baseRoutes from './routes-base'
import sessionRoutes from './routes-sessions'
import vipRoutes from './routes-vip'
import portalRoutes from './routes-portal'

/**
 * /api/schedule
 *   rooms / classes          教室、班课（routes-base.ts）
 *   sessions/*               课次查询、冲突检测、新建、批量、修改、取消、确认、课堂记录（routes-sessions.ts）
 *   vip/*                    VIP 班级（课时包）（routes-vip.ts）
 *   portal/*                 学生端：我的课时、确认课时（routes-portal.ts）
 */
export default async function (app: FastifyInstance) {
  await app.register(baseRoutes)
  await app.register(sessionRoutes)
  await app.register(vipRoutes)
  await app.register(portalRoutes)
}
