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
  /** 可管理的校区：所属校区 + 额外指定的校区（数据范围为「本校区」时按它限制） */
  campusIds: number[]
  identity: string
  perms: string[]
  dataScope: DataScope
  roleNames: string[]
  /** 持有任一「只读」角色：只能查看，所有修改请求被拒绝（见 assertWritable） */
  readOnly: boolean
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
      include: { roles: { include: { role: { include: { permissions: true } } } }, manageCampuses: { select: { campusId: true } } },
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
        campusIds: [...new Set([...(u.campusId ? [u.campusId] : []), ...u.manageCampuses.map((c) => c.campusId)])],
        identity: u.identity,
        perms: [...perms],
        dataScope: scope,
        roleNames: u.roles.map((r) => r.role.name),
        readOnly: u.roles.some((r) => r.role.readOnly),
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
  assertWritable(req, p)
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** 只读账号仍可调用的写接口：只影响本人的提醒已读状态 */
const READ_ONLY_ALLOW = [/^\/api\/common\/notifications\/(\d+\/read|read-all)$/]

/**
 * 只读角色（演示 / 审计账号）：除查询外的请求一律拒绝。
 * 所有需要登录的接口都经过 authenticate，因此这里是唯一的拦截点；
 * 约定 GET 接口不修改数据，新增接口时请遵守。
 */
function assertWritable(req: FastifyRequest, p: Principal) {
  if (p.type !== 'staff' || !p.readOnly || SAFE_METHODS.has(req.method)) return
  const url = req.url.split('?')[0]
  if (READ_ONLY_ALLOW.some((r) => r.test(url))) return
  // 演示站可开启：只读账号允许排课 / 改课 / 取消课次（业务规则 → 演示）
  if (RULES.readOnlyCanSchedule && /^\/api\/schedule\/sessions(\/|$)/.test(url)) return
  throw new AppError(403, '当前账号为只读（演示）账号，不能修改数据', 'READ_ONLY')
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
 * - dataScope=CAMPUS：可管理的校区（所属校区 + 账号上额外指定的校区）
 * - dataScope=SELF：ownerField = 本人（未给 ownerField 时退化为可管理的校区）
 */
export function scopeWhere(
  user: StaffPrincipal,
  opts: { ownerField?: string; campusField?: string; allPerm?: string } = {},
): Record<string, unknown> {
  const { ownerField, campusField = 'campusId', allPerm } = opts
  if (user.perms.includes('*') || (allPerm && user.perms.includes(allPerm)) || user.dataScope === 'ALL') return {}
  if (user.dataScope === 'CAMPUS') return { [campusField]: { in: campusList(user) } }
  if (ownerField) return { [ownerField]: user.id }
  return { [campusField]: { in: campusList(user) } }
}

/** 受限账号可管理的校区；一个都没有时用 [-1]（不匹配任何校区），避免退化成「不限」 */
const campusList = (user: StaffPrincipal) => (user.campusIds.length ? user.campusIds : [-1])

/**
 * 校区限制：null = 不限（超级管理员、数据范围「全部」）；数组 = 只能访问这些校区
 * （所属校区 + 账号上额外指定的可管理校区）。一个都没有时为 [-1]，按拒绝处理。
 */
export function campusLimit(user: StaffPrincipal): number[] | null {
  if (user.perms.includes('*') || user.dataScope === 'ALL') return null
  return campusList(user)
}

/** 某校区是否在账号的可管理范围内 */
export function inCampus(user: StaffPrincipal, campusId: number | null | undefined): boolean {
  const lim = campusLimit(user)
  return lim == null || (campusId != null && lim.includes(campusId))
}

/** 按 ID 操作归属某校区的数据前调用：数据范围不是「全部」的账号只能操作可管理的校区 */
export function assertCampus(user: StaffPrincipal, campusId: number | null | undefined, message = '只能操作本校区的数据') {
  if (!inCampus(user, campusId)) throw forbidden(message)
}

/** 列表的 campusId 筛选：与 where 中已有的校区限制取交集（筛选参数不能越过数据范围） */
export function andCampus(where: object, requested?: number | null) {
  if (!requested) return
  const w = where as { campusId?: unknown }
  const cur = w.campusId
  if (cur == null) w.campusId = requested
  else if (typeof cur === 'number') w.campusId = cur === requested ? requested : -1
  else w.campusId = ((cur as { in?: number[] }).in ?? []).includes(requested) ? requested : -1
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
