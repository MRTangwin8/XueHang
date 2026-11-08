import type { FastifyRequest } from 'fastify'
import { prisma } from './prisma'

/** 写操作日志。detail 传对象会被 JSON 序列化 */
export async function audit(
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId?: string | number | null,
  detail?: unknown,
) {
  const userId = req.user?.type === 'staff' ? req.user.id : null
  await prisma.operationLog.create({
    data: {
      userId,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      detail: detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
      ip: req.ip,
    },
  })
}
