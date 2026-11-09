import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { hashPassword, zStrongPassword } from '../../lib/password'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { pageArgs, pageQuery, paged, parse, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { hasPerm, invalidatePrincipal, perm, staff } from '../../plugins/auth'
import { audit } from '../../lib/audit'
import { effectiveSuperAdmins } from './roles'

const P = perm('system.user')

const zIds = z.array(z.coerce.number().int().positive()).default([])
const zOptInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v == null || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请输入非负数字' })
      return z.NEVER
    }
    return Math.round(n)
  })

const userBase = z.object({
  staffNo: z.string().trim().min(1, '请填写工号').max(30),
  name: z.string().trim().min(1, '请填写姓名').max(50),
  phone: zOptStr,
  email: zOptStr,
  identity: z.enum(['TEACHER', 'STAFF', 'OTHER']).default('STAFF'),
  campusId: z.coerce.number().int().positive().nullable().optional(),
  roleIds: zIds,
  subjectIds: zIds,
  hourlyWage: zOptInt,
  transportFee: zOptInt,
  bankName: zOptStr,
  bankBranch: zOptStr,
  bankAccount: zOptStr,
  bankHolder: zOptStr,
  note: zOptStr,
  sort: z.coerce.number().int().default(50),
})
const zPassword = zStrongPassword

const userInclude = {
  campus: { select: { id: true, name: true } },
  roles: { include: { role: { select: { id: true, name: true, isSystem: true } } } },
  subjects: { include: { subject: { select: { id: true, name: true, category: true, active: true } } } },
} satisfies Prisma.UserInclude

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>

function view(u: UserRow) {
  const { passwordHash: _ph, roles, subjects, ...rest } = u
  return {
    ...rest,
    roles: roles.map((r) => r.role),
    roleIds: roles.map((r) => r.role.id),
    subjects: subjects.map((s) => s.subject).sort((a, b) => a.id - b.id),
    subjectIds: subjects.map((s) => s.subject.id),
  }
}

/** 拥有「*」权限的角色 id */
async function superRoleIds(): Promise<number[]> {
  const rows = await prisma.rolePermission.findMany({ where: { code: '*' }, select: { roleId: true } })
  return rows.map((r) => r.roleId)
}

/** 除 excludeUserId 外，仍然有效（未删除、未锁定）且拥有「*」的账号数 */
const otherSuperAdmins = (excludeUserId: number) => effectiveSuperAdmins({ excludeUserId })

async function isSuperUser(userId: number): Promise<boolean> {
  const ids = await superRoleIds()
  if (!ids.length) return false
  return (await prisma.userRole.count({ where: { userId, roleId: { in: ids } } })) > 0
}

async function ensureNotLastSuper(userId: number, what: string) {
  // 只读角色的持有者不算有效超级管理员；去掉该账号后一个不剩才拦截
  if ((await effectiveSuperAdmins()) > 0 && (await otherSuperAdmins(userId)) === 0)
    throw badRequest(`该账号是最后一个有效的超级管理员（拥有全部权限），不能${what}`)
}

async function checkRefs(campusId: number | null | undefined, roleIds: number[], subjectIds: number[]) {
  if (campusId) {
    const c = await prisma.campus.findFirst({ where: { id: campusId, deletedAt: null } })
    if (!c) throw badRequest('校区不存在或已删除')
  }
  if (roleIds.length) {
    const n = await prisma.role.count({ where: { id: { in: roleIds } } })
    if (n !== new Set(roleIds).size) throw badRequest('包含不存在的职务角色')
  }
  if (subjectIds.length) {
    const n = await prisma.teachingSubject.count({ where: { id: { in: subjectIds } } })
    if (n !== new Set(subjectIds).size) throw badRequest('包含不存在的教授课程')
  }
}

export default async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: P }, async (req) => {
    const q = parse(
      pageQuery.extend({
        q: z.string().trim().optional(),
        identity: z.string().optional(),
        campusId: z.coerce.number().int().optional(),
        roleId: z.coerce.number().int().optional(),
        subjectId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        deleted: z.string().optional(),
      }),
      req.query,
    )
    const deleted = q.deleted === '1' || q.deleted === 'true'
    const where: Prisma.UserWhereInput = { deletedAt: deleted ? { not: null } : null }
    if (q.identity) where.identity = q.identity
    if (q.campusId) where.campusId = q.campusId
    if (q.status) where.status = q.status
    if (q.roleId) where.roles = { some: { roleId: q.roleId } }
    if (q.subjectId) where.subjects = { some: { subjectId: q.subjectId } }
    if (q.q) where.OR = [{ name: { contains: q.q } }, { staffNo: { contains: q.q } }, { phone: { contains: q.q } }]
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: userInclude,
        ...pageArgs(q),
        orderBy: deleted ? [{ deletedAt: 'desc' }] : [{ sort: 'asc' }, { id: 'asc' }],
      }),
      prisma.user.count({ where }),
    ])
    return paged(items.map(view), total, q)
  })

  app.get('/users/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const u = await prisma.user.findUnique({ where: { id }, include: userInclude })
    if (!u) throw notFound('工号不存在')
    return view(u)
  })

  app.post('/users', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { roleIds, subjectIds, password, ...data } = parse(userBase.extend({ password: zPassword }), req.body)
    await checkRefs(data.campusId, roleIds, subjectIds)
    if (!hasPerm(me, '*')) {
      const sup = await superRoleIds()
      if (roleIds.some((r) => sup.includes(r))) throw forbidden('只有超级管理员可以分配超级管理员角色')
    }
    if (await prisma.user.findUnique({ where: { staffNo: data.staffNo } }))
      throw conflict('工号已存在（可能在回收站中，可恢复后使用）')
    const u = await prisma.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(password),
        roles: { create: [...new Set(roleIds)].map((roleId) => ({ roleId })) },
        subjects: { create: [...new Set(subjectIds)].map((subjectId) => ({ subjectId })) },
      },
      include: userInclude,
    })
    await audit(req, 'create', 'User', u.id, { staffNo: u.staffNo, name: u.name, identity: u.identity, roleIds, subjectIds })
    return view(u)
  })

  app.put('/users/:id', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const { roleIds, subjectIds, ...data } = parse(userBase, req.body)
    const old = await prisma.user.findUnique({ where: { id }, include: { roles: true } })
    if (!old) throw notFound('工号不存在')
    await checkRefs(data.campusId, roleIds, subjectIds)
    const dup = await prisma.user.findFirst({ where: { staffNo: data.staffNo, id: { not: id } } })
    if (dup) throw conflict('工号已被其他账号使用')

    const sup = await superRoleIds()
    const oldRoleIds = old.roles.map((r) => r.roleId)
    const newRoleIds = [...new Set(roleIds)]
    const superChanged = sup.some((r) => oldRoleIds.includes(r) !== newRoleIds.includes(r))
    if (superChanged && !hasPerm(me, '*')) throw forbidden('只有超级管理员可以调整超级管理员角色')
    // 非超级管理员不能修改超级管理员的资料（否则可改其邮箱再走「找回密码」接管账号）
    if (!hasPerm(me, '*') && oldRoleIds.some((r) => sup.includes(r))) throw forbidden('只有超级管理员可以修改超级管理员账号')
    // 有效超级管理员 = 有非只读的「*」角色且不持有只读角色；去掉「*」角色或加上只读角色都会使其失效
    const roleRows = await prisma.role.findMany({ where: { id: { in: [...oldRoleIds, ...newRoleIds] } }, select: { id: true, readOnly: true } })
    const ro = new Set(roleRows.filter((r) => r.readOnly).map((r) => r.id))
    const effective = (ids: number[]) => ids.some((r) => sup.includes(r) && !ro.has(r)) && !ids.some((r) => ro.has(r))
    if (effective(oldRoleIds) && !effective(newRoleIds) && !old.deletedAt && old.status === 'ACTIVE' && (await otherSuperAdmins(id)) === 0)
      throw badRequest('该账号是最后一个有效的超级管理员，不能移除其超级管理员角色或为其添加只读角色')

    const u = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } })
      await tx.userSubject.deleteMany({ where: { userId: id } })
      return tx.user.update({
        where: { id },
        data: {
          ...data,
          roles: { create: newRoleIds.map((roleId) => ({ roleId })) },
          subjects: { create: [...new Set(subjectIds)].map((subjectId) => ({ subjectId })) },
        },
        include: userInclude,
      })
    })
    invalidatePrincipal('staff', id)
    await audit(req, 'update', 'User', id, { ...data, roleIds: newRoleIds, subjectIds, bankAccount: data.bankAccount ? '***' : null })
    return view(u)
  })

  app.post('/users/:id/reset-password', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const { password } = parse(z.object({ password: zPassword }), req.body)
    const u = await prisma.user.findUnique({ where: { id } })
    if (!u) throw notFound('工号不存在')
    if (id !== me.id && !hasPerm(me, '*') && (await isSuperUser(id))) throw forbidden('只有超级管理员可以重置超级管理员的密码')
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } })
    invalidatePrincipal('staff', id)
    await audit(req, 'reset-password', 'User', id, { staffNo: u.staffNo })
    return { ok: true }
  })

  app.post('/users/:id/lock', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    if (id === me.id) throw badRequest('不能锁定自己的账号')
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null } })
    if (!u) throw notFound('工号不存在或已删除')
    if (u.status === 'LOCKED') return { ok: true }
    if (!hasPerm(me, '*') && (await isSuperUser(id))) throw forbidden('只有超级管理员可以锁定超级管理员')
    await ensureNotLastSuper(id, '锁定')
    await prisma.user.update({ where: { id }, data: { status: 'LOCKED' } })
    invalidatePrincipal('staff', id)
    await audit(req, 'lock', 'User', id, { staffNo: u.staffNo })
    return { ok: true }
  })

  app.post('/users/:id/unlock', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null } })
    if (!u) throw notFound('工号不存在或已删除')
    await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } })
    invalidatePrincipal('staff', id)
    await audit(req, 'unlock', 'User', id, { staffNo: u.staffNo })
    return { ok: true }
  })

  /** 软删除：UserRole / UserSubject 原样保留，恢复后角色与课程不变 */
  app.delete('/users/:id', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    if (id === me.id) throw badRequest('不能删除自己的账号')
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null } })
    if (!u) throw notFound('工号不存在或已删除')
    if (!hasPerm(me, '*') && (await isSuperUser(id))) throw forbidden('只有超级管理员可以删除超级管理员')
    await ensureNotLastSuper(id, '删除')
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })
    invalidatePrincipal('staff', id)
    await audit(req, 'delete', 'User', id, { staffNo: u.staffNo, name: u.name })
    return { ok: true }
  })

  app.post('/users/:id/restore', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const u = await prisma.user.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!u) throw notFound('工号不存在或未删除')
    await prisma.user.update({ where: { id }, data: { deletedAt: null } })
    invalidatePrincipal('staff', id)
    await audit(req, 'restore', 'User', id, { staffNo: u.staffNo, name: u.name })
    return { ok: true }
  })
}
