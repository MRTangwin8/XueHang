import type { FastifyInstance } from 'fastify'
import attendance from './attendance'
import interviews from './interviews'
import documents from './documents'
import prints from './prints'
import notices from './notices'
import wage from './wage'
import wageScope from './wage-scope'
import portal from './portal'
import dashboard from './dashboard'

/**
 * 教学服务模块（/api/service）：
 * 出勤管理、面谈 / 面试预约与记录、文书修改、资料打印、通知公告、资料下载、工资申报 / 审核、首页看板、学生端接口（/portal/*）
 */
export default async function (app: FastifyInstance) {
  await app.register(attendance)
  await app.register(interviews)
  await app.register(documents)
  await app.register(prints)
  await app.register(notices)
  await app.register(wage)
  await app.register(wageScope)
  await app.register(portal)
  await app.register(dashboard)
}
