/**
 * 由后端直接提供前端页面（web/dist 存在时启用）。
 * 用于 Docker 单容器部署，或不想单独配置 Nginx 的小规模部署；
 * 开发环境（vite dev）和「Nginx 托管静态文件」的部署不受影响。
 */
import type { FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { WEB_DIST } from './paths'

/**
 * 页面的内容安全策略：脚本只允许同源文件（构建产物没有内联脚本）；
 * 样式允许内联（组件库会写入行内样式）；图片 / 文件预览允许 data: 与 blob:。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * @param decorateReply 该实例上是否还没有注册过 @fastify/static（注册过则必须为 false）
 * @returns 是否启用
 */
export async function registerWebStatic(app: FastifyInstance, decorateReply: boolean): Promise<boolean> {
  const index = path.join(WEB_DIST, 'index.html')
  if (!existsSync(index)) return false

  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    decorateReply,
    index: false,
    list: false,
    dotfiles: 'deny',
    cacheControl: false,
    // 带内容哈希的资源可长期缓存；其余（favicon 等）短缓存
    setHeaders(res, file) {
      const value = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
      // 不同版本的 @fastify/static 传入的对象不同（原生 response 或 reply），两种写法都兼容
      const r = res as unknown as { setHeader?: (k: string, v: string) => void; header?: (k: string, v: string) => void }
      if (typeof r.setHeader === 'function') r.setHeader('Cache-Control', value)
      else r.header?.('Cache-Control', value)
    },
  })

  const sendIndex = (reply: import('fastify').FastifyReply) =>
    reply.header('Cache-Control', 'no-cache').header('Content-Security-Policy', CSP).type('text/html; charset=utf-8').sendFile('index.html', WEB_DIST)

  app.get('/', (_req, reply) => sendIndex(reply))

  // 单页应用：非接口、非上传文件、非静态资源的 GET 请求都返回 index.html，由前端路由处理
  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0]
    const isPage = req.method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/uploads/') && !url.startsWith('/assets/') && !path.extname(url)
    if (isPage) return sendIndex(reply)
    return reply.status(404).send({ code: 'NOT_FOUND', message: `Route ${req.method}:${url} not found` })
  })
  return true
}
