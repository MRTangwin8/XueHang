import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, zIdParam } from '../../lib/http'
import { conflict, notFound } from '../../lib/errors'
import { perm } from '../../plugins/auth'
import { audit } from '../../lib/audit'

const P = perm('system.subject')

/** 默认分类（可自由输入新的分类） */
export const SUBJECT_CATEGORIES = ['EJU', '语言与通识', 'TA', '大学院文科', '大学院理科', '美术']

const subjectBody = z.object({
  name: z.string().trim().min(1, '请填写课程名称').max(50),
  category: z.string().trim().min(1, '请填写分类').max(30),
  sort: z.coerce.number().int().default(50),
  active: z.boolean().default(true),
})

export default async function subjectRoutes(app: FastifyInstance) {
  /** 全部科目（含停用），附关联的有效教职工数 */
  app.get('/subjects', { preHandler: perm('system.subject', 'system.user') }, async () => {
    const list = await prisma.teachingSubject.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { users: { where: { user: { deletedAt: null } } } } } },
    })
    return list.map(({ _count, ...s }) => ({ ...s, userCount: _count.users }))
  })

  /** 分类列表：默认分类 + 已有数据中出现的分类 */
  app.get('/subject-categories', { preHandler: perm('system.subject', 'system.user') }, async () => {
    const rows = await prisma.teachingSubject.groupBy({ by: ['category'], orderBy: { category: 'asc' } })
    return [...new Set([...SUBJECT_CATEGORIES, ...rows.map((r) => r.category)])]
  })

  app.post('/subjects', { preHandler: P }, async (req) => {
    const body = parse(subjectBody, req.body)
    if (await prisma.teachingSubject.findUnique({ where: { name: body.name } })) throw conflict('课程名称已存在（可能已停用）')
    const s = await prisma.teachingSubject.create({ data: body })
    await audit(req, 'create', 'TeachingSubject', s.id, body)
    return s
  })

  app.put('/subjects/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const body = parse(subjectBody, req.body)
    if (!(await prisma.teachingSubject.findUnique({ where: { id } }))) throw notFound('课程不存在')
    const dup = await prisma.teachingSubject.findFirst({ where: { name: body.name, id: { not: id } } })
    if (dup) throw conflict('课程名称已存在')
    const s = await prisma.teachingSubject.update({ where: { id }, data: body })
    await audit(req, 'update', 'TeachingSubject', id, body)
    return s
  })

  /** 删除 = 停用（已关联的教职工不受影响） */
  app.delete('/subjects/:id', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const s = await prisma.teachingSubject.findUnique({ where: { id } })
    if (!s) throw notFound('课程不存在')
    await prisma.teachingSubject.update({ where: { id }, data: { active: false } })
    await audit(req, 'delete', 'TeachingSubject', id, { name: s.name })
    return { ok: true }
  })

  app.post('/subjects/:id/restore', { preHandler: P }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const s = await prisma.teachingSubject.findUnique({ where: { id } })
    if (!s) throw notFound('课程不存在')
    await prisma.teachingSubject.update({ where: { id }, data: { active: true } })
    await audit(req, 'restore', 'TeachingSubject', id, { name: s.name })
    return { ok: true }
  })
}
