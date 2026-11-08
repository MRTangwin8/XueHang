/**
 * 薪资审核范围：每位审核人可单独配置能审核哪些员工的申报。
 *   ALL     全部员工
 *   CAMPUS  审核人所在校区的员工
 *   CUSTOM  自定义：若干校区的全部员工 + 单独指定的员工（取并集）
 * 未配置的审核人：角色数据范围为 ALL 时看全部，否则看本校区（与旧行为一致）。
 * 超级管理员（*）始终不受限。除超级管理员外，任何人不能审核自己的申报。
 */
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, zId, zIdParam } from '../../lib/http'
import { badRequest } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { hasPerm, perm, staff, type StaffPrincipal } from '../../plugins/auth'

export const REVIEW_MODES = ['ALL', 'CAMPUS', 'CUSTOM'] as const
const NOTHING: Prisma.UserWhereInput = { id: -1 }

/** 审核人能看到 / 审核的员工范围（作用在 WageClaim.user 上） */
export async function reviewableUsers(me: StaffPrincipal): Promise<Prisma.UserWhereInput> {
  if (hasPerm(me, '*')) return {}
  const cfg = await prisma.wageReviewScope.findUnique({ where: { reviewerId: me.id }, include: { campuses: true, users: true } })
  const mode = cfg?.mode ?? (me.dataScope === 'ALL' ? 'ALL' : 'CAMPUS')
  if (mode === 'ALL') return {}
  if (mode === 'CAMPUS') return me.campusId ? { campusId: me.campusId } : NOTHING
  const campusIds = cfg?.campuses.map((c) => c.campusId) ?? []
  const userIds = cfg?.users.map((u) => u.userId) ?? []
  const or: Prisma.UserWhereInput[] = []
  if (campusIds.length) or.push({ campusId: { in: campusIds } })
  if (userIds.length) or.push({ id: { in: userIds } })
  return or.length ? { OR: or } : NOTHING
}

/** 是否可以审核本人的申报（只有超级管理员可以） */
export const canReviewOwn = (me: StaffPrincipal) => hasPerm(me, '*')

/** 用于说明当前审核范围（前端提示） */
async function describe(reviewerId: number) {
  const cfg = await prisma.wageReviewScope.findUnique({
    where: { reviewerId },
    include: {
      campuses: { include: { campus: { select: { id: true, name: true } } } },
      users: { include: { user: { select: { id: true, name: true, staffNo: true } } } },
    },
  })
  return cfg
    ? { configured: true, mode: cfg.mode, campuses: cfg.campuses.map((c) => c.campus), users: cfg.users.map((u) => u.user), updatedAt: cfg.updatedAt }
    : { configured: false, mode: null, campuses: [], users: [], updatedAt: null }
}

export default async function (app: FastifyInstance) {
  const manage = { preHandler: perm('system.user', 'system.role') }

  /** 当前登录审核人的范围说明 */
  app.get('/wage/review-scope/me', { preHandler: perm('wage.review') }, async (req) => {
    const me = staff(req)
    const d = await describe(me.id)
    const effective = hasPerm(me, '*') ? 'ALL' : (d.mode ?? (me.dataScope === 'ALL' ? 'ALL' : 'CAMPUS'))
    return { ...d, effective, canReviewOwn: canReviewOwn(me) }
  })

  /** 所有拥有「薪资审核」权限的员工及其审核范围 */
  app.get('/wage/review-scopes', manage, async () => {
    const reviewers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { role: { permissions: { some: { code: { in: ['wage.review', '*'] } } } } } },
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        staffNo: true,
        campus: { select: { id: true, name: true } },
        roles: { select: { role: { select: { name: true, dataScope: true, permissions: { select: { code: true } } } } } },
      },
    })
    return Promise.all(
      reviewers.map(async (u) => {
        const isSuper = u.roles.some((r) => r.role.permissions.some((p) => p.code === '*'))
        const roleAll = u.roles.some((r) => r.role.dataScope === 'ALL')
        const d = await describe(u.id)
        return {
          id: u.id,
          name: u.name,
          staffNo: u.staffNo,
          campus: u.campus,
          roleNames: u.roles.map((r) => r.role.name),
          isSuper,
          defaultMode: roleAll ? 'ALL' : 'CAMPUS',
          ...d,
        }
      }),
    )
  })

  /** 设置某位审核人的范围 */
  app.put('/wage/review-scopes/:id', manage, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(
      z.object({
        mode: z.enum(REVIEW_MODES),
        campusIds: z.array(zId).max(50).default([]),
        userIds: z.array(zId).max(500).default([]),
      }),
      req.body,
    )
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, staffNo: true } })
    if (!u) throw badRequest('员工不存在')
    if (b.mode === 'CUSTOM' && !b.campusIds.length && !b.userIds.length) throw badRequest('自定义范围请至少选择一个校区或员工')
    const campusIds = b.mode === 'CUSTOM' ? [...new Set(b.campusIds)] : []
    const userIds = b.mode === 'CUSTOM' ? [...new Set(b.userIds)] : []
    await prisma.$transaction(async (tx) => {
      await tx.wageReviewScope.upsert({ where: { reviewerId: id }, create: { reviewerId: id, mode: b.mode }, update: { mode: b.mode } })
      await tx.wageReviewCampus.deleteMany({ where: { reviewerId: id } })
      await tx.wageReviewUser.deleteMany({ where: { reviewerId: id } })
      if (campusIds.length) await tx.wageReviewCampus.createMany({ data: campusIds.map((campusId) => ({ reviewerId: id, campusId })) })
      if (userIds.length) await tx.wageReviewUser.createMany({ data: userIds.map((userId) => ({ reviewerId: id, userId })) })
    })
    await audit(req, 'update', 'WageReviewScope', id, { staffNo: u.staffNo, mode: b.mode, campusIds, userIds })
    return describe(id)
  })

  /** 清除配置，恢复按角色数据范围 */
  app.delete('/wage/review-scopes/:id', manage, async (req) => {
    const { id } = parse(zIdParam, req.params)
    await prisma.wageReviewScope.deleteMany({ where: { reviewerId: id } })
    await audit(req, 'reset', 'WageReviewScope', id)
    return { ok: true }
  })
}
