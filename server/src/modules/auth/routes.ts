import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/http'
import { badRequest, unauthorized } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { hashPassword, needsRehash, verifyPassword, zStrongPassword } from '../../lib/password'
import { assertNotLocked, recordFailure, recordSuccess } from '../../lib/rateLimit'
import { anyUser, clearFileCookie, invalidatePrincipal, setFileCookie, signToken, staffOnly } from '../../plugins/auth'
import { PERMISSIONS } from '../../permissions'
import { RULES } from '../../dict'
import { createHash, randomBytes } from 'node:crypto'
import { absoluteLink, getSmtp, sendMail } from '../../lib/mail'

const loginFail = (left: number) =>
  unauthorized(
    left === 0
      ? `账号或密码错误，已锁定 ${RULES.loginLockMinutes} 分钟`
      : left <= 2
        ? `账号或密码错误（再错 ${left} 次将锁定 ${RULES.loginLockMinutes} 分钟）`
        : '账号或密码错误',
  )

export default async function (app: FastifyInstance) {
  /** 教职工登录：工号 + 密码 */
  app.post('/login', async (req, reply) => {
    const body = parse(z.object({ staffNo: z.string().trim().min(1).max(50), password: z.string().min(1).max(128) }), req.body)
    const account = `staff:${body.staffNo.toLowerCase()}`
    assertNotLocked(account, req.ip)
    const u = await prisma.user.findFirst({ where: { staffNo: body.staffNo, deletedAt: null } })
    if (!(await verifyPassword(body.password, u?.passwordHash))) {
      const left = recordFailure(account, req.ip)
      await prisma.operationLog.create({ data: { userId: u?.id ?? null, action: 'login_failed', entity: 'User', entityId: body.staffNo, ip: req.ip } })
      throw loginFail(left)
    }
    if (u!.status !== 'ACTIVE') throw unauthorized('账号已锁定，请联系管理员')
    recordSuccess(account)
    // 旧的低成本哈希在登录成功时自动升级
    const passwordHash = needsRehash(u!.passwordHash) ? await hashPassword(body.password) : u!.passwordHash
    await prisma.user.update({ where: { id: u!.id }, data: { lastLoginAt: new Date(), lastLoginIp: req.ip, passwordHash } })
    invalidatePrincipal('staff', u!.id)
    req.user = { type: 'staff', id: u!.id } as never
    await audit(req, 'login', 'User', u!.id)
    const token = signToken(app, 'staff', u!.id, passwordHash)
    setFileCookie(req, reply, token)
    return { token, weakPassword: !zStrongPassword.safeParse(body.password).success }
  })

  /** 学生端登录：学号 + 密码 */
  app.post('/student-login', async (req, reply) => {
    const body = parse(z.object({ studentNo: z.string().trim().min(1).max(50), password: z.string().min(1).max(128) }), req.body)
    const account = `student:${body.studentNo.toLowerCase()}`
    assertNotLocked(account, req.ip)
    const s = await prisma.student.findFirst({ where: { studentNo: body.studentNo, deletedAt: null } })
    if (!(await verifyPassword(body.password, s?.portalPasswordHash))) {
      const left = recordFailure(account, req.ip)
      await prisma.operationLog.create({ data: { action: 'login_failed', entity: 'Student', entityId: body.studentNo, ip: req.ip } })
      throw loginFail(left)
    }
    if (!s!.portalEnabled) throw unauthorized('学生端账号未开通')
    recordSuccess(account)
    let hash = s!.portalPasswordHash!
    if (needsRehash(hash)) {
      hash = await hashPassword(body.password)
      await prisma.student.update({ where: { id: s!.id }, data: { portalPasswordHash: hash } })
    }
    const token = signToken(app, 'student', s!.id, hash)
    setFileCookie(req, reply, token)
    return { token, weakPassword: !zStrongPassword.safeParse(body.password).success }
  })

  /** 退出：清除文件访问 Cookie（token 本身由前端丢弃） */
  // ---------------- 找回密码（需启用 SMTP 并填写系统访问地址） ----------------
  const RESET_TTL_MS = 30 * 60_000
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

  /** 登录页据此决定是否显示「忘记密码」 */
  app.get('/forgot/available', async () => {
    const s = await getSmtp()
    return { enabled: s.enabled && !!s.siteUrl }
  })

  /**
   * 申请重置：无论账号是否存在、是否有邮箱，都返回相同结果，防止探测账号。
   * 链接只使用后台配置的系统访问地址，不使用请求头里的 Host（防止被伪造成钓鱼链接）。
   */
  app.post('/forgot', async (req) => {
    const b = parse(z.object({ type: z.enum(['staff', 'student']), account: z.string().trim().min(1).max(50) }), req.body)
    const s = await getSmtp()
    if (!s.enabled || !s.siteUrl) throw badRequest('系统未开启邮件找回密码，请联系管理员重置')
    const key = `forgot:${b.type}:${b.account.toLowerCase()}`
    assertNotLocked(key, req.ip)
    recordFailure(key, req.ip) // 计入频率限制：同一账号 / IP 短时间内多次申请会被锁定
    const acc =
      b.type === 'staff'
        ? await prisma.user.findFirst({ where: { staffNo: b.account, deletedAt: null, status: 'ACTIVE' }, select: { id: true, email: true, name: true } })
        : await prisma.student.findFirst({ where: { studentNo: b.account, deletedAt: null, portalEnabled: true }, select: { id: true, email: true, name: true } })
    if (acc?.email) {
      const token = randomBytes(32).toString('base64url')
      await prisma.passwordReset.updateMany({ where: { type: b.type, accountId: acc.id, usedAt: null }, data: { usedAt: new Date() } })
      await prisma.passwordReset.create({
        data: { type: b.type, accountId: acc.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS), ip: req.ip },
      })
      const link = await absoluteLink(`/reset-password?type=${b.type}&token=${token}`)
      void sendMail(
        acc.email,
        '重置密码 / Reset your password',
        `${acc.name}，您好：\n\n请在 30 分钟内打开下面的链接设置新密码（仅可使用一次）：\n${link}\n\n如果不是您本人操作，请忽略本邮件。\n\nOpen the link above within 30 minutes to set a new password. If you did not request this, ignore this email.`,
      ).catch((e) => req.log.error(e, '找回密码邮件发送失败'))
      await prisma.operationLog.create({ data: { action: 'forgot_password', entity: b.type === 'staff' ? 'User' : 'Student', entityId: String(acc.id), ip: req.ip } })
    }
    return { ok: true }
  })

  /** 用邮件中的令牌设置新密码 */
  app.post('/reset', async (req) => {
    const b = parse(z.object({ token: z.string().min(20).max(200), newPassword: zStrongPassword }), req.body)
    const r = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(b.token) } })
    if (!r || r.usedAt || r.expiresAt < new Date()) throw badRequest('链接无效或已过期，请重新申请')
    const used = await prisma.passwordReset.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } })
    if (!used.count) throw badRequest('链接无效或已过期，请重新申请')
    const hash = await hashPassword(b.newPassword)
    if (r.type === 'staff') await prisma.user.update({ where: { id: r.accountId }, data: { passwordHash: hash } })
    else await prisma.student.update({ where: { id: r.accountId }, data: { portalPasswordHash: hash } })
    invalidatePrincipal(r.type as 'staff' | 'student', r.accountId)
    await prisma.operationLog.create({ data: { action: 'reset_password', entity: r.type === 'staff' ? 'User' : 'Student', entityId: String(r.accountId), ip: req.ip } })
    return { ok: true, type: r.type }
  })

  app.post('/logout', async (_req, reply) => {
    clearFileCookie(reply)
    return { ok: true }
  })

  /** 当前登录者信息 + 权限；同时刷新文件访问 Cookie */
  app.get('/me', { preHandler: anyUser }, async (req, reply) => {
    const raw = req.headers.authorization?.slice(7)
    if (raw) setFileCookie(req, reply, raw)
    const p = req.user
    if (p.type === 'staff') {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: p.id }, include: { campus: true } })
      return { ...p, staffNo: u.staffNo, campusName: u.campus?.name ?? null }
    }
    const s = await prisma.student.findUniqueOrThrow({ where: { id: p.id }, include: { campus: true } })
    return { ...p, studentNo: s.studentNo, campusName: s.campus.name }
  })

  /** 修改本人密码（教职工 / 学生通用）；成功后返回新 token，其他设备上的旧登录全部失效 */
  app.post('/change-password', { preHandler: anyUser }, async (req, reply) => {
    const body = parse(z.object({ oldPassword: z.string().min(1).max(128), newPassword: zStrongPassword }), req.body)
    if (body.oldPassword === body.newPassword) throw badRequest('新密码不能与原密码相同')
    const p = req.user
    let hash: string
    if (p.type === 'staff') {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: p.id } })
      if (!(await verifyPassword(body.oldPassword, u.passwordHash))) throw badRequest('原密码错误')
      hash = await hashPassword(body.newPassword)
      await prisma.user.update({ where: { id: p.id }, data: { passwordHash: hash } })
    } else {
      const s = await prisma.student.findUniqueOrThrow({ where: { id: p.id } })
      if (!(await verifyPassword(body.oldPassword, s.portalPasswordHash))) throw badRequest('原密码错误')
      hash = await hashPassword(body.newPassword)
      await prisma.student.update({ where: { id: p.id }, data: { portalPasswordHash: hash } })
    }
    invalidatePrincipal(p.type, p.id)
    await audit(req, 'change_password', p.type === 'staff' ? 'User' : 'Student', p.id)
    const token = signToken(app, p.type, p.id, hash)
    setFileCookie(req, reply, token)
    return { ok: true, token }
  })

  /** 权限点目录（角色编辑器用） */
  app.get('/permissions', { preHandler: staffOnly }, async () => PERMISSIONS)
}
