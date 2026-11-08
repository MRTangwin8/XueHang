/**
 * SMTP 邮件发送（nodemailer，MIT-0 许可）。
 * 配置保存在 Setting 'smtp'；密码用 AES-256-GCM 加密存储（密钥由 JWT_SECRET 派生），接口永不返回明文。
 * 用途：站内提醒同时发邮件（可开关）、找回密码、发送测试邮件。
 */
import nodemailer, { type Transporter } from 'nodemailer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from './prisma'
import { badRequest } from './errors'

export const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200),
  port: z.coerce.number().int().min(1).max(65535),
  /** true = 465 端口的 SSL/TLS；false = 587 / 25 端口（如服务器支持会自动 STARTTLS） */
  secure: z.boolean(),
  user: z.string().trim().max(200),
  /** 只在修改密码时传入；不传或传 undefined 表示保留原密码，传空字符串表示清除 */
  password: z.string().max(500).optional(),
  fromName: z.string().trim().max(100),
  fromAddress: z.string().trim().max(200),
  /** 站内提醒同时发送邮件（收件人需在档案中填写邮箱） */
  notifyByEmail: z.boolean(),
  /** 系统对外访问地址（如 https://crm.example.com），邮件中的链接与找回密码使用；为空时不发送带链接的邮件 */
  siteUrl: z.string().trim().max(300).refine((v) => !v || /^https?:\/\/[^\s/]+/.test(v), '访问地址应以 http:// 或 https:// 开头'),
})
export type SmtpInput = z.infer<typeof smtpSchema>
interface SmtpStored extends Omit<SmtpInput, 'password'> {
  passwordEnc: string | null
}

const DEFAULTS: SmtpStored = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  passwordEnc: null,
  fromName: '',
  fromAddress: '',
  notifyByEmail: false,
  siteUrl: '',
}

// ---------------- 加解密 ----------------
const key = () => createHash('sha256').update(`smtp:${process.env.JWT_SECRET ?? 'dev-only-change-me'}`).digest()
function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}
function decrypt(enc: string): string | null {
  try {
    const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64'))
    const d = createDecipheriv('aes-256-gcm', key(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(data), d.final()]).toString('utf8')
  } catch {
    return null // JWT_SECRET 变更后无法解密，需要重新填写密码
  }
}

// ---------------- 读写配置 ----------------
let cache: SmtpStored | null = null
let transporter: Transporter | null = null

export async function getSmtp(): Promise<SmtpStored> {
  if (cache) return cache
  const row = await prisma.setting.findUnique({ where: { key: 'smtp' } })
  let saved: Partial<SmtpStored> = {}
  try {
    saved = row ? JSON.parse(row.value) : {}
  } catch {
    /* ignore */
  }
  cache = { ...DEFAULTS, ...saved }
  return cache
}

/** 给前端看的配置：不含密码，只告诉是否已设置 */
export async function getSmtpPublic() {
  const { passwordEnc, ...rest } = await getSmtp()
  return { ...rest, hasPassword: !!passwordEnc }
}

export async function saveSmtp(input: unknown) {
  const b = smtpSchema.parse(input)
  const cur = await getSmtp()
  const passwordEnc = b.password === undefined ? cur.passwordEnc : b.password === '' ? null : encrypt(b.password)
  const { password: _omit, ...rest } = b
  const next: SmtpStored = { ...rest, passwordEnc }
  if (next.enabled && (!next.host || !next.fromAddress)) throw badRequest('启用邮件前请填写 SMTP 服务器和发件地址')
  const value = JSON.stringify(next)
  await prisma.setting.upsert({ where: { key: 'smtp' }, create: { key: 'smtp', value }, update: { value } })
  cache = next
  transporter = null
  return getSmtpPublic()
}

async function getTransporter(): Promise<{ t: Transporter; from: string } | null> {
  const s = await getSmtp()
  if (!s.enabled || !s.host || !s.fromAddress) return null
  if (!transporter) {
    const pass = s.passwordEnc ? decrypt(s.passwordEnc) : null
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: pass ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  const from = s.fromName ? `"${s.fromName.replace(/["\\\r\n]/g, '')}" <${s.fromAddress}>` : s.fromAddress
  return { t: transporter, from }
}

export const isMailEnabled = async () => !!(await getTransporter())

/** 发送邮件；未启用时返回 false。text 为纯文本正文（不发送 HTML，避免内容注入） */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const tr = await getTransporter()
  if (!tr) return false
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 250) // 防止邮件头注入
  await tr.t.sendMail({ from: tr.from, to: clean(to), subject: clean(subject), text })
  return true
}

/** 测试 SMTP：先校验连接与认证，再发送一封测试邮件 */
export async function testSmtp(to: string) {
  const tr = await getTransporter()
  if (!tr) throw badRequest('请先启用并保存 SMTP 配置')
  try {
    await tr.t.verify()
  } catch (e) {
    throw badRequest(`SMTP 连接或认证失败：${(e as Error).message}`)
  }
  await sendMail(to, '学航 · SMTP 测试邮件', '这是一封测试邮件。收到此邮件说明 SMTP 配置正确。\n\nThis is a test email. SMTP is configured correctly.')
}

/** 拼接系统内链接（未配置访问地址时返回 null） */
export async function absoluteLink(pathname: string): Promise<string | null> {
  const s = await getSmtp()
  if (!s.siteUrl) return null
  return s.siteUrl.replace(/\/+$/, '') + (pathname.startsWith('/') ? pathname : `/${pathname}`)
}
