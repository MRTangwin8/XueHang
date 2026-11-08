/** 邮件（SMTP）设置：/api/mail，权限 system.mail */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse } from '../../lib/http'
import { audit } from '../../lib/audit'
import { getSmtpPublic, saveSmtp, testSmtp } from '../../lib/mail'
import { perm } from '../../plugins/auth'

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('system.mail') }

  app.get('/', guard, async () => getSmtpPublic())

  app.put('/', guard, async (req) => {
    const r = await saveSmtp(req.body)
    // 日志中不记录密码
    const { password: _p, ...logged } = (req.body ?? {}) as Record<string, unknown>
    await audit(req, 'update', 'Smtp', 'smtp', logged)
    return r
  })

  app.post('/test', guard, async (req) => {
    const { to } = parse(z.object({ to: z.email('请输入正确的邮箱地址') }), req.body)
    await testSmtp(to)
    await audit(req, 'test', 'Smtp', 'smtp', { to })
    return { ok: true }
  })
}
