import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { parse, zIdParam } from '../../lib/http'
import { saveUpload } from '../../lib/upload'
import { forbidden } from '../../lib/errors'
import { andCampus, anyUser, campusLimit, hasPerm, perm, staff, staffOnly } from '../../plugins/auth'
import { DICT_HIDDEN, DICTS, RULES } from '../../dict'
import { EDU } from '../../lib/educonfig'

/**
 * 公共接口：字典、上传、各种下拉选择的轻量查询、站内通知。
 * 供所有模块的前端组件复用（UserSelect / StudentSelect / RoomSelect / DictSelect / FileUpload）。
 */
export default async function (app: FastifyInstance) {
  // hidden：已隐藏的选项（历史数据仍可显示，新表单不再提供）
  // edu：考试类型 / 成绩模板 / 档案字段（成绩与档案设置）
  app.get('/dicts', async () => ({ dicts: DICTS, hidden: DICT_HIDDEN, rules: RULES, edu: EDU }))

  /** 上传：?kind=document|print|image|file → { url, name, size } */
  app.post('/upload', { preHandler: anyUser }, async (req) => {
    const { kind } = parse(z.object({ kind: z.string().default('file') }), req.query)
    // 公开目录只允许站点管理员上传 Logo，避免任意用户把文件放进无需登录即可访问的位置
    if (kind === 'logo' && !hasPerm(req.user, 'system.site')) throw forbidden('没有上传站点 Logo 的权限')
    const f = await saveUpload(req, kind)
    return { url: f.url, name: f.name, size: f.size }
  })

  app.get('/campuses', { preHandler: anyUser }, async () =>
    prisma.campus.findMany({ where: { deletedAt: null }, orderBy: [{ sort: 'asc' }, { id: 'asc' }], select: { id: true, name: true, code: true, timezone: true } }),
  )

  /** 教职工下拉：?identity=TEACHER&campusId=&q=&ids=1,2 */
  app.get('/users', { preHandler: staffOnly }, async (req) => {
    const q = parse(
      z.object({ identity: z.string().optional(), campusId: z.coerce.number().optional(), q: z.string().optional(), ids: z.string().optional() }),
      req.query,
    )
    const where: Prisma.UserWhereInput = { deletedAt: null, status: 'ACTIVE' }
    if (q.ids) where.id = { in: q.ids.split(',').map(Number) }
    if (q.identity) where.identity = q.identity
    if (q.campusId) where.campusId = q.campusId
    if (q.q) where.OR = [{ name: { contains: q.q } }, { staffNo: { contains: q.q } }]
    return prisma.user.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 300,
      select: { id: true, name: true, staffNo: true, identity: true, campusId: true },
    })
  })

  /** 学员远程搜索：?q=&status=ENROLLED&ids= */
  app.get('/students', { preHandler: staffOnly }, async (req) => {
    const q = parse(z.object({ q: z.string().optional(), status: z.string().optional(), campusId: z.coerce.number().optional(), ids: z.string().optional() }), req.query)
    const me = staff(req)
    const where: Prisma.StudentWhereInput = { deletedAt: null }
    // 下拉搜索只返回姓名 / 学号，但仍受校区范围限制；按电话搜索需要学员查看权限
    const lim = campusLimit(me)
    if (lim != null) where.campusId = { in: lim }
    if (q.ids) where.id = { in: q.ids.split(',').map(Number).filter(Number.isInteger).slice(0, 200) }
    if (q.status) where.status = q.status
    andCampus(where, q.campusId)
    const byPhone = ['student.view', 'student.all', 'student.edit', 'teacher.students'].some((c) => hasPerm(me, c))
    if (q.q) where.OR = [{ name: { contains: q.q } }, { studentNo: { contains: q.q } }, { nameAlt: { contains: q.q } }, ...(byPhone ? [{ phone: { contains: q.q } }] : [])]
    return prisma.student.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 50,
      select: { id: true, name: true, studentNo: true, status: true, campusId: true },
    })
  })

  app.get('/rooms', { preHandler: anyUser }, async (req) => {
    const q = parse(z.object({ campusId: z.coerce.number().optional() }), req.query)
    return prisma.room.findMany({
      where: { active: true, ...(q.campusId ? { campusId: q.campusId } : {}) },
      orderBy: [{ campusId: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, building: true, kind: true, campusId: true, capacity: true, allowVip: true },
    })
  })

  app.get('/subjects', { preHandler: staffOnly }, async () =>
    prisma.teachingSubject.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
  )

  app.get('/channels', { preHandler: staffOnly }, async () =>
    prisma.channel.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
  )

  // 合作机构名单只给需要选择机构的岗位（客户 / 报名 / 学员档案）
  app.get('/organizations', { preHandler: perm('crm.customer.view', 'crm.customer.all', 'crm.pool', 'crm.channel', 'student.enroll', 'student.edit', 'student.all') }, async (req) => {
    const q = parse(z.object({ q: z.string().optional() }), req.query)
    return prisma.organization.findMany({
      where: { deletedAt: null, ...(q.q ? { name: { contains: q.q } } : {}) },
      orderBy: { id: 'desc' },
      take: 100,
      select: { id: true, name: true, type: true },
    })
  })

  app.get('/class-groups', { preHandler: staffOnly }, async (req) => {
    const q = parse(z.object({ campusId: z.coerce.number().optional(), status: z.string().optional() }), req.query)
    return prisma.classGroup.findMany({
      where: { deletedAt: null, ...(q.campusId ? { campusId: q.campusId } : {}), ...(q.status ? { status: q.status } : {}) },
      orderBy: { id: 'desc' },
      select: { id: true, name: true, campusId: true, teacherId: true, status: true },
    })
  })

  // ---------------- 站内通知 ----------------
  app.get('/notifications', { preHandler: anyUser }, async (req) => {
    const p = req.user
    const where: Prisma.NotificationWhereInput = p.type === 'staff' ? { userId: p.id } : { studentId: p.id }
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { id: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ])
    return { items, unread }
  })

  app.post('/notifications/:id/read', { preHandler: anyUser }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const p = req.user
    await prisma.notification.updateMany({
      where: { id, ...(p.type === 'staff' ? { userId: p.id } : { studentId: p.id }) },
      data: { readAt: new Date() },
    })
    return { ok: true }
  })

  app.post('/notifications/read-all', { preHandler: anyUser }, async (req) => {
    const p = req.user
    await prisma.notification.updateMany({
      where: { readAt: null, ...(p.type === 'staff' ? { userId: p.id } : { studentId: p.id }) },
      data: { readAt: new Date() },
    })
    return { ok: true }
  })
}
