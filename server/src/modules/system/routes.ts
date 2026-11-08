import type { FastifyInstance } from 'fastify'
import campusRoutes from './campuses'
import userRoutes from './users'
import roleRoutes from './roles'
import subjectRoutes from './subjects'
import logRoutes from './logs'

/**
 * 系统设置 /api/system
 *  - 校区   /campuses    (system.campus)
 *  - 工号   /users       (system.user)
 *  - 角色   /roles       (system.role)
 *  - 科目   /subjects    (system.subject)
 *  - 日志   /logs        (system.log)
 */
export default async function (app: FastifyInstance) {
  await campusRoutes(app)
  await userRoutes(app)
  await roleRoutes(app)
  await subjectRoutes(app)
  await logRoutes(app)
}
