/** 邮件（SMTP）设置：/api/mail，权限 system.mail */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse } from '../../lib/http'
import { audit } from '../../lib/audit'
import { getSmtpPublic, saveSmtp, testSmtp } from '../../lib/mail'
import { perm, staff } from '../../plugins/auth'

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('system.mail') }

  app.get('/', guard, async (req) => {
    const cfg = await getSmtpPublic()
    // 只读（演示）账号看不到真实的服务器、账号、发件人和访问地址，一律显示为示例值
    if (staff(req).readOnly) {
      return {
        ...cfg,
        host: cfg.host ? 'smtp.example.com' : '',
        user: cfg.user ? 'user@example.com' : '',
        fromName: cfg.fromName ? 'Example' : '',
        fromAddress: cfg.fromAddress ? 'noreply@example.com' : '',
        siteUrl: cfg.siteUrl ? 'https://example.com' : '',
      }
    }
    return cfg
  })

  app.put('/', guard, async (req) => {
    const r = await saveSmtp(req.body)
    // 操作日志只记开关类字段：不记录密码，也不记录服务器、账号、发件人等（日志可能被只读账号看到）
    const body = (req.body ?? {}) as Record<string, unknown>
    await audit(req, 'update', 'Smtp', 'smtp', { enabled: body.enabled, port: body.port, secure: body.secure, notifyByEmail: body.notifyByEmail })
    return r
  })

  app.post('/test', guard, async (req) => {
    const { to } = parse(z.object({ to: z.email('请输入正确的邮箱地址') }), req.body)
    await testSmtp(to)
    await audit(req, 'test', 'Smtp', 'smtp', { to })
    return { ok: true }
  })
}
