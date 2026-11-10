import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Prisma } from './generated/prisma/client'
import { ZodError } from 'zod'
import authPlugin, { authorizeFileRequest } from './plugins/auth'
import { AppError } from './lib/errors'
import { UPLOAD_ROOT } from './lib/upload'
import { loadSettings } from './lib/rules'
import { VERSION_INFO } from './lib/version'
import { pickLang, translate } from './i18n'
import { registerWebStatic } from './lib/webstatic'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * 模块自动注册：src/modules/<name>/routes.ts 默认导出 `async (app) => {}`，
 * 挂载到 /api/<name>。可选 src/modules/<name>/jobs.ts 默认导出 `(app) => void` 启动定时任务。
 * 新增模块无需修改本文件。
 */
async function registerModules(app: FastifyInstance, startJobs: boolean) {
  const dir = path.join(here, 'modules')
  for (const name of readdirSync(dir).sort()) {
    for (const ext of ['.ts', '.js']) {
      const routes = path.join(dir, name, `routes${ext}`)
      if (existsSync(routes)) {
        const mod = await import(pathToFileURL(routes).href)
        await app.register(mod.default, { prefix: `/api/${name}` })
        break
      }
    }
    if (!startJobs) continue
    for (const ext of ['.ts', '.js']) {
      const jobs = path.join(dir, name, `jobs${ext}`)
      if (existsSync(jobs)) {
        const mod = await import(pathToFileURL(jobs).href)
        app.addHook('onReady', async () => mod.default(app))
        break
      }
    }
  }
}

export async function buildApp(opts: { logger?: boolean; jobs?: boolean } = {}) {
  // trustProxy：仅在部署于反向代理之后时开启（TRUST_PROXY=1），否则客户端可伪造 X-Forwarded-For 绕过登录限流
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: process.env.TRUST_PROXY === '1', bodyLimit: 1024 * 1024 })

  // 前端经同源代理访问 API，默认不开放跨域；确需跨域时用 CORS_ORIGIN=https://a.com,https://b.com
  const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
  if (origins?.length) await app.register(cors, { origin: origins })
  // 单文件大小上限由「业务规则」uploadMaxMB 决定（lib/upload.ts 每次上传时读取），这里设硬上限 100MB
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 10 } })
  await app.register(authPlugin)

  // 安全响应头
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'same-origin')
    reply.header('Cross-Origin-Resource-Policy', 'same-origin')
  })

  // 上传文件需登录后才能访问（Cookie 或 Bearer），防止文件地址外泄后被任意下载
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/uploads/')) return
    // 站点 Logo 目录公开（登录页需要显示）；路径中含 .. 或编码字符的一律走鉴权
    if (/^\/uploads\/public\/[0-9a-f]{32}\.(png|jpe?g|webp)$/.test(req.url)) return
    if (!(await authorizeFileRequest(app, req))) return reply.status(401).send({ code: 'UNAUTHORIZED', message: '请先登录' })
  })

  mkdirSync(UPLOAD_ROOT, { recursive: true })
  await app.register(fastifyStatic, { root: UPLOAD_ROOT, prefix: '/uploads/', decorateReply: true, list: false, dotfiles: 'deny', index: false })

  app.setErrorHandler((err, req, reply) => {
    const lang = pickLang(req.headers['accept-language'])
    const message = (value: string) => translate(value, lang)
    const details = (value: unknown) => Array.isArray(value) ? value.map((item: unknown) => {
      if (item && typeof item === 'object' && 'message' in item && typeof item.message === 'string') {
        return { ...item, message: message(item.message) }
      }
      return item
    }) : value
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ code: err.code, message: message(err.message), details: details(err.details) })
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        code: 'BAD_REQUEST', message: message(err.issues[0]?.message ?? '参数错误'), details: details(err.issues),
      })
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.status(409).send({ code: 'DUPLICATE', message: message('数据重复（唯一字段已存在）') })
      if (err.code === 'P2025') return reply.status(404).send({ code: 'NOT_FOUND', message: message('记录不存在') })
      if (err.code === 'P2003') return reply.status(409).send({ code: 'FK', message: message('存在关联数据，无法操作') })
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.status(status).send({ code: 'ERROR', message: message((err as Error).message) })
    req.log.error(err)
    return reply.status(500).send({ code: 'INTERNAL', message: message('服务器内部错误') })
  })

  // 查询参数中的空字符串视为未传（前端筛选框清空后常发 ?month=&status=），避免可选参数校验失败
  app.addHook('preHandler', async (req) => {
    const q = req.query as Record<string, unknown> | undefined
    if (q && typeof q === 'object') for (const k of Object.keys(q)) if (q[k] === '') delete q[k]
  })

  app.get('/api/health', async () => ({ ok: true, ...VERSION_INFO }))
  // 安装向导在切换到正式应用后据此确认安装完成
  app.get('/api/install/status', async () => ({ installed: true }))
  // 业务规则与下拉选项（后台可配置）在注册模块、启动定时任务之前载入
  await loadSettings()
  await registerModules(app, opts.jobs ?? true)
  // 有前端构建产物（web/dist）时由后端直接提供页面
  if (await registerWebStatic(app, false)) app.log.info('已启用内置前端页面（web/dist）')
  return app
}
