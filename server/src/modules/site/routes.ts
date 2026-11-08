import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/http'
import { audit } from '../../lib/audit'
import { perm } from '../../plugins/auth'

const text = (max: number, min = 0) => z.string().trim().min(min).max(max)
const siteSchema = z.object({
  siteName: text(20, 1),
  siteSubtitle: text(30),
  // Logo 必须是通过 kind=logo 上传到公开目录的图片（登录页未登录也要能显示）
  logoUrl: z.string().trim().regex(/^\/uploads\/public\/[0-9a-f]{32}\.(png|jpe?g|webp)$/, 'Logo 地址不合法，请重新上传').nullable(),
  primaryColor: text(7).regex(/^#[0-9a-fA-F]{6}$/, '请输入六位十六进制颜色'),
  browserTitle: text(40, 1),
  loginTitle: text(40),
  loginSubtitle: text(60),
  heroTitle: text(60),
  heroPoints: z.array(text(40)).max(6),
  footerText: text(60),
  portalTitle: text(20),
  portalLoginSubtitle: text(60),
}).strict()

const defaults: z.infer<typeof siteSchema> = {
  siteName: '学航',
  siteSubtitle: '教学管理平台',
  logoUrl: null,
  primaryColor: '#4f46e5',
  browserTitle: '学航 · 教学管理平台',
  loginTitle: '欢迎回来',
  loginSubtitle: '教职工登录',
  heroTitle: '让每一位学生的升学之路\n都清晰可见',
  heroPoints: [
    '教室与课程统一排期，冲突实时提示',
    'VIP 课时账本，待确认 48 小时自动确认',
    '客户跟进、报名缴费、出勤面谈一站管理',
  ],
  footerText: '© 学航 · 教学管理平台',
  portalTitle: '学生端',
  portalLoginSubtitle: '查看课时、预约面谈、提交文书与打印',
}

async function readConfig() {
  const row = await prisma.setting.findUnique({ where: { key: 'site' } })
  if (!row) return { ...defaults }
  try {
    return siteSchema.parse({ ...defaults, ...JSON.parse(row.value) })
  } catch {
    return { ...defaults }
  }
}

export default async function (app: FastifyInstance) {
  app.get('/', async () => readConfig())
  app.put('/', { preHandler: perm('system.site') }, async (req) => {
    const patch = parse(siteSchema.partial().strict(), req.body)
    const body = parse(siteSchema, { ...await readConfig(), ...patch })
    const value = JSON.stringify(body)
    await prisma.setting.upsert({ where: { key: 'site' }, create: { key: 'site', value }, update: { value } })
    await audit(req, 'update', 'Site', 'site', body)
    return body
  })
  app.post('/reset', { preHandler: perm('system.site') }, async (req) => {
    await prisma.setting.deleteMany({ where: { key: 'site' } })
    await audit(req, 'reset', 'Site', 'site')
    return { ...defaults }
  })
}
