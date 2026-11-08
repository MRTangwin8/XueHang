import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { hasPerm, invalidatePrincipal, perm, staff } from '../../plugins/auth'
import { audit } from '../../lib/audit'
import { ALL_PERMISSION_CODES } from '../../permissions'

const P = perm('system.role')

const roleBody = z.object({
  name: z.string().trim().min(1, '请填写角色名称').max(30),
  description: zOptStr,
  dataScope: z.enum(['SELF', 'CAMPUS', 'ALL']).default('SELF'),
  sort: z.coerce.number().int().default(50),
  permissions: z.array(z.string().trim()).default([]),
})

function normalizePerms(codes: string[]): string[] {
  const set = new Set(codes.filter(Boolean))
  const bad = [...set].filter((c) => c !== '*' && !ALL_PERMISSION_CODES.includes(c))
  if (bad.length) throw badRequest(`未知的权限点：${bad.join('、')}`)
  // 拥有「*」时其他权限点无意义，只保留「*」
  return set.has('*') ? ['*'] : [...set]
}

export default async function roleRoutes(app: FastifyInstance) {
  app.get('/roles', { preHandler: perm('system.role', 'system.user') }, async () => {
    const roles = await prisma.role.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        permissions: { select: { code: true } },
        _count: { select: { users: { where: { user: { deletedAt: null } } } } },
      },
    })
    return roles.map(({ permissions, _count, ...r }) => ({ ...r, permissions: permissions.map((p) => p.code), userCount: _count.users }))
  })

  app.post('/roles', { preHandler: P }, async (req) => {
    const me = staff(req)
    const body = parse(roleBody, req.body)
    const permissions = normalizePerms(body.permissions)
    if (permissions.includes('*') && !hasPerm(me, '*')) throw forbidden('只有超级管理员可以创建拥有全部权限的角色')
    if (await prisma.role.findUnique({ where: { name: body.name } })) throw conflict('角色名称已存在')
    const r = await prisma.role.create({
      data: { name: body.name, description: body.description, dataScope: body.dataScope, sort: body.sort, permissions: { create: permissions.map((code) => ({ code })) } },
    })
    invalidatePrincipal()
    await audit(req, 'create', 'Role', r.id, { ...body, permissions })
    return { ...r, permissions, userCount: 0 }
  })

  app.put('/roles/:id', { preHandler: P }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(roleBody, req.body)
    const permissions = normalizePerms(body.permissions)
    const old = await prisma.role.findUnique({ where: { id }, include: { permissions: true } })
    if (!old) throw notFound('角色不存在')
    const oldPerms = old.permissions.map((p) => p.code)
    const hadStar = oldPerms.includes('*')
    const hasStar = permissions.includes('*')
    if (old.isSystem && body.name !== old.name) throw badRequest('系统内置角色不可改名')
    if (old.isSystem && hadStar && !hasStar) throw badRequest('系统内置角色不可去掉「全部权限」')
    if ((hadStar || hasStar) && !hasPerm(me, '*')) throw forbidden('只有超级管理员可以修改拥有全部权限的角色')
    if (hadStar && !hasStar) {
      // 去掉「*」后若已无其他有效超级管理员，拒绝
      const others = await prisma.user.count({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { roleId: { not: id }, role: { permissions: { some: { code: '*' } } } } },
        },
      })
      if (others === 0) throw badRequest('去掉「全部权限」后将没有有效的超级管理员')
    }
    const dup = await prisma.role.findFirst({ where: { name: body.name, id: { not: id } } })
    if (dup) throw conflict('角色名称已存在')
    const r = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } })
      return tx.role.update({
        where: { id },
        data: { name: body.name, description: body.description, dataScope: body.dataScope, sort: body.sort, permissions: { create: permissions.map((code) => ({ code })) } },
      })
    })
    invalidatePrincipal()
    const added = permissions.filter((c) => !oldPerms.includes(c))
    const removed = oldPerms.filter((c) => !permissions.includes(c))
    await audit(req, 'update', 'Role', id, { name: body.name, dataScope: body.dataScope, added, removed })
    return { ...r, permissions }
  })

  app.delete('/roles/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const old = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!old) throw notFound('角色不存在')
    if (old.isSystem) throw badRequest('系统内置角色不可删除')
    if (old._count.users > 0) throw badRequest(`该角色下还有 ${old._count.users} 个账号（含回收站），请先移除后再删除`)
    await prisma.role.delete({ where: { id } })
    invalidatePrincipal()
    await audit(req, 'delete', 'Role', id, { name: old.name })
    return { ok: true }
  })
}
