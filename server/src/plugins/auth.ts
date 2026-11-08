import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { prisma } from '../lib/prisma'
import { AppError, forbidden, unauthorized } from '../lib/errors'
import { passwordVersion } from '../lib/password'
import { RULES } from '../dict'

export type DataScope = 'SELF' | 'CAMPUS' | 'ALL'

export interface StaffPrincipal {
  type: 'staff'
  id: number
  name: string
  campusId: number | null
  identity: string
  perms: string[]
  dataScope: DataScope
  roleNames: string[]
}
export interface StudentPrincipal {
  type: 'student'
  id: number
  name: string
  campusId: number
}
export type Principal = StaffPrincipal | StudentPrincipal

export interface TokenPayload {
  type: 'staff' | 'student'
  id: number
  /** 密码版本指纹（lib/password.passwordVersion），密码变更后旧 token 失效 */
  pv: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload
    user: Principal
  }
}

const SCOPE_RANK: Record<DataScope, number> = { SELF: 0, CAMPUS: 1, ALL: 2 }
const cache = new Map<string, { at: number; pv: string; p: Principal }>()
const CACHE_MS = 15_000

/** 角色 / 权限 / 账号状态变更后调用，使缓存失效（不传 id 清空全部） */
export function invalidatePrincipal(type?: 'staff' | 'student', id?: number) {
  if (!type || id == null) cache.clear()
  else cache.delete(`${type}:${id}`)
}

export async function loadPrincipal(payload: TokenPayload): Promise<Principal | null> {
  const key = `${payload.type}:${payload.id}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pv === payload.pv ? hit.p : null
  let p: Principal | null = null
  let pv = ''
  if (payload.type === 'staff') {
    const u = await prisma.user.findFirst({
      where: { id: payload.id, deletedAt: null, status: 'ACTIVE' },
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    })
    if (u) {
      pv = passwordVersion(u.passwordHash)
      const perms = new Set<string>()
      let scope: DataScope = 'SELF'
      for (const ur of u.roles) {
        ur.role.permissions.forEach((rp) => perms.add(rp.code))
        const s = ur.role.dataScope as DataScope
        if (SCOPE_RANK[s] > SCOPE_RANK[scope]) scope = s
      }
      p = {
        type: 'staff',
        id: u.id,
        name: u.name,
        campusId: u.campusId,
        identity: u.identity,
        perms: [...perms],
        dataScope: scope,
        roleNames: u.roles.map((r) => r.role.name),
      }
    }
  } else {
    const s = await prisma.student.findFirst({ where: { id: payload.id, deletedAt: null, portalEnabled: true } })
    if (s) {
      pv = passwordVersion(s.portalPasswordHash)
      p = { type: 'student', id: s.id, name: s.name, campusId: s.campusId }
    }
  }
  if (p) cache.set(key, { at: Date.now(), pv, p })
  return p && pv === payload.pv ? p : null
}

/** 签发 token（登录、修改密码后调用） */
export function signToken(app: FastifyInstance, type: 'staff' | 'student', id: number, passwordHash: string | null): string {
  return app.jwt.sign({ type, id, pv: passwordVersion(passwordHash) } satisfies TokenPayload, { expiresIn: tokenTtlSec() })
}

// ---------------- 上传文件访问凭证（HttpOnly Cookie） ----------------
// <img>/<a> 无法携带 Authorization 头，所以登录后另发一个仅作用于 /uploads 的 HttpOnly Cookie，
// 未登录者即使拿到文件地址也无法下载。

export const FILE_COOKIE = 'xh_file'

/** 在响应上设置（或刷新）文件访问 Cookie */
export function setFileCookie(req: FastifyRequest, reply: FastifyReply, token: string) {
  const secure = req.protocol === 'https' ? '; Secure' : ''
  reply.header('Set-Cookie', `${FILE_COOKIE}=${token}; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=${tokenTtlSec()}${secure}`)
}

export function clearFileCookie(reply: FastifyReply) {
  reply.header('Set-Cookie', `${FILE_COOKIE}=; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=0`)
}

function readCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

/** /uploads/* 的访问校验：Cookie 或 Authorization 任一有效即可 */
export async function authorizeFileRequest(app: FastifyInstance, req: FastifyRequest): Promise<boolean> {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const token = bearer ?? readCookie(req, FILE_COOKIE)
  if (!token) return false
  try {
    const payload = app.jwt.verify<TokenPayload>(token)
    return !!(await loadPrincipal(payload))
  } catch {
    return false
  }
}

/** 是否拥有权限点（"*" 为超级管理员） */
export function hasPerm(user: Principal | undefined, code: string): boolean {
  if (!user || user.type !== 'staff') return false
  return user.perms.includes('*') || user.perms.includes(code)
}

async function authenticate(req: FastifyRequest) {
  let payload: TokenPayload
  try {
    payload = await req.jwtVerify<TokenPayload>()
  } catch {
    throw unauthorized()
  }
  const p = await loadPrincipal(payload)
  if (!p) throw new AppError(401, '账号不存在或已停用', 'UNAUTHORIZED')
  req.user = p
}

/** preHandler：任意已登录用户（教职工或学生） */
export async function anyUser(req: FastifyRequest, _reply: FastifyReply) {
  await authenticate(req)
}

/** preHandler：仅教职工 */
export async function staffOnly(req: FastifyRequest, _reply: FastifyReply) {
  await authenticate(req)
  if (req.user.type !== 'staff') throw forbidden('仅限教职工')
}

/** preHandler：仅学生端 */
export async function studentOnly(req: FastifyRequest, _reply: FastifyReply) {
  await authenticate(req)
  if (req.user.type !== 'student') throw forbidden('仅限学生')
}

/** preHandler 工厂：教职工且拥有任一权限点。例：{ preHandler: perm('crm.customer.view') } */
export function perm(...codes: string[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    await authenticate(req)
    if (req.user.type !== 'staff') throw forbidden('仅限教职工')
    if (!codes.some((c) => hasPerm(req.user, c))) throw forbidden()
  }
}

/** 断言当前用户是教职工，返回类型收窄后的 principal */
export function staff(req: FastifyRequest): StaffPrincipal {
  if (req.user?.type !== 'staff') throw forbidden('仅限教职工')
  return req.user
}

/** 断言当前用户是学生 */
export function student(req: FastifyRequest): StudentPrincipal {
  if (req.user?.type !== 'student') throw forbidden('仅限学生')
  return req.user
}

/**
 * 数据范围过滤：返回 Prisma where 片段。
 * - 拥有 "*" 或 allPerm，或角色 dataScope=ALL：不限
 * - dataScope=CAMPUS：本校区（campusField）
 * - dataScope=SELF：ownerField = 本人（未给 ownerField 时退化为本校区）
 */
export function scopeWhere(
  user: StaffPrincipal,
  opts: { ownerField?: string; campusField?: string; allPerm?: string } = {},
): Record<string, unknown> {
  const { ownerField, campusField = 'campusId', allPerm } = opts
  if (user.perms.includes('*') || (allPerm && user.perms.includes(allPerm)) || user.dataScope === 'ALL') return {}
  if (user.dataScope === 'CAMPUS' && user.campusId) return { [campusField]: user.campusId }
  if (ownerField) return { [ownerField]: user.id }
  return user.campusId ? { [campusField]: user.campusId } : {}
}

/** 登录有效期 3 天 */
/** 登录有效期（秒），来自「业务规则 → 登录安全 → 登录有效天数」 */
export const tokenTtlSec = () => RULES.sessionDays * 24 * 3600
const DEV_SECRET = 'dev-only-change-me'

function resolveSecret(log: FastifyInstance['log']): string {
  const secret = process.env.JWT_SECRET ?? ''
  const weak = !secret || secret === DEV_SECRET || secret.length < 32
  if (weak && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET 未设置或过弱（至少 32 位随机字符），生产环境拒绝启动')
  }
  if (weak) log.warn('JWT_SECRET 过弱，仅可用于本地开发')
  return secret || DEV_SECRET
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: resolveSecret(app.log),
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  })
})
