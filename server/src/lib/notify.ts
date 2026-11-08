import { prisma } from './prisma'
import { absoluteLink, getSmtp, sendMail } from './mail'

interface NotifyOpts {
  content?: string
  link?: string
}

/**
 * 「站内提醒同时发邮件」开启时，异步发送邮件：不阻塞业务、失败只记日志。
 * 收件人需在档案中填写邮箱；邮件为纯文本，附系统内链接（需配置系统访问地址）。
 */
async function mailIfEnabled(email: string | null | undefined, title: string, opts: NotifyOpts) {
  try {
    if (!email) return
    const s = await getSmtp()
    if (!s.enabled || !s.notifyByEmail) return
    const link = opts.link ? await absoluteLink(opts.link) : null
    const body = [opts.content, link ? `\n${link}` : ''].filter(Boolean).join('\n')
    await sendMail(email, title, body || title)
  } catch (e) {
    console.error('[mail] 提醒邮件发送失败：', (e as Error).message)
  }
}

/** 给教职工发站内提醒（并按设置发送邮件） */
export async function notifyUser(userId: number, title: string, opts: NotifyOpts = {}) {
  const n = await prisma.notification.create({ data: { userId, title, ...opts } })
  void prisma.user
    .findUnique({ where: { id: userId }, select: { email: true } })
    .then((u) => mailIfEnabled(u?.email, title, opts))
    .catch(() => undefined)
  return n
}

/** 给学生发站内提醒（学生端可见，并按设置发送邮件） */
export async function notifyStudent(studentId: number, title: string, opts: NotifyOpts = {}) {
  const n = await prisma.notification.create({ data: { studentId, title, ...opts } })
  void prisma.student
    .findUnique({ where: { id: studentId }, select: { email: true } })
    .then((s) => mailIfEnabled(s?.email, title, opts))
    .catch(() => undefined)
  return n
}
