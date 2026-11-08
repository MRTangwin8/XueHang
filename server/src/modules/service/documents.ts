import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zId, zOptStr } from '../../lib/http'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyStudent, notifyUser } from '../../lib/notify'
import { perm, staff, hasPerm } from '../../plugins/auth'
import { assertUploadUrl } from './util'

const docInclude = {
  student: { select: { id: true, name: true, studentNo: true } },
  assignedTeacher: { select: { id: true, name: true } },
} satisfies Prisma.DocumentRequestInclude

export default async function (app: FastifyInstance) {
  /** 列表：document.manage 看全部；仅 document.review 只看分配给自己的 */
  app.get('/documents', { preHandler: perm('document.manage', 'document.review') }, async (req) => {
    const me = staff(req)
    const q = parse(
      pageQuery.extend({
        status: z.string().optional(),
        assignedTeacherId: z.coerce.number().int().optional(),
        studentId: z.coerce.number().int().optional(),
        mine: z.string().optional(),
        trash: z.string().optional(),
        overdue: z.string().optional(),
        q: z.string().optional(),
      }),
      req.query,
    )
    const manage = hasPerm(me, 'document.manage')
    const trash = q.trash === '1' || q.trash === 'true'
    if (trash && !manage) throw forbidden('仅文书管理员可查看回收站')
    const where: Prisma.DocumentRequestWhereInput = { deletedAt: trash ? { not: null } : null }
    if (!manage || q.mine === '1' || q.mine === 'true') where.assignedTeacherId = me.id
    else if (q.assignedTeacherId) where.assignedTeacherId = q.assignedTeacherId
    if (q.status) where.status = { in: q.status.split(',') }
    if (q.studentId) where.studentId = q.studentId
    if (q.overdue === '1') Object.assign(where, { status: { not: 'RETURNED' }, dueAt: { lt: new Date() } })
    if (q.q) where.OR = [{ title: { contains: q.q } }, { student: { name: { contains: q.q } } }, { student: { studentNo: { contains: q.q } } }]
    const [rows, total] = await Promise.all([
      prisma.documentRequest.findMany({ where, ...pageArgs(q), orderBy: [{ submittedAt: 'desc' }], include: docInclude }),
      prisma.documentRequest.count({ where }),
    ])
    const now = Date.now()
    const items = rows.map((d) => ({ ...d, overdue: d.status !== 'RETURNED' && +d.dueAt < now }))
    // 标签计数
    const base: Prisma.DocumentRequestWhereInput = { deletedAt: null }
    const [mineCount, unassigned, trashCount] = await Promise.all([
      prisma.documentRequest.count({ where: { ...base, assignedTeacherId: me.id, status: 'ASSIGNED' } }),
      manage ? prisma.documentRequest.count({ where: { ...base, status: 'SUBMITTED' } }) : Promise.resolve(0),
      manage ? prisma.documentRequest.count({ where: { deletedAt: { not: null } } }) : Promise.resolve(0),
    ])
    return { ...paged(items, total, q), counts: { mine: mineCount, unassigned, trash: trashCount } }
  })

  app.post('/documents/:id/assign', { preHandler: perm('document.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const { teacherId } = parse(z.object({ teacherId: zId }), req.body)
    const doc = await prisma.documentRequest.findFirst({ where: { id, deletedAt: null }, include: { student: { select: { name: true } } } })
    if (!doc) throw notFound('文书申请不存在')
    if (doc.status === 'RETURNED') throw badRequest('该申请已返还，不能再分配')
    const t = await prisma.user.findFirst({ where: { id: teacherId, deletedAt: null }, select: { id: true, name: true } })
    if (!t) throw badRequest('老师不存在')
    const r = await prisma.documentRequest.update({ where: { id }, data: { assignedTeacherId: teacherId, assignedAt: new Date(), status: 'ASSIGNED' }, include: docInclude })
    await notifyUser(teacherId, '有待修改的书类', { content: `${doc.student.name}：${doc.title}`, link: '/service/documents?mine=1' })
    await audit(req, 'assign', 'DocumentRequest', id, { teacherId })
    return r
  })

  /** 返还：被分配老师或 document.manage */
  app.post('/documents/:id/return', { preHandler: perm('document.manage', 'document.review') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ returnFileUrl: zOptStr, returnFileName: zOptStr, returnNote: zOptStr }), req.body)
    const doc = await prisma.documentRequest.findFirst({ where: { id, deletedAt: null } })
    if (!doc) throw notFound('文书申请不存在')
    if (!hasPerm(me, 'document.manage') && doc.assignedTeacherId !== me.id) throw forbidden('只能返还分配给自己的文书')
    if (doc.status === 'RETURNED') throw badRequest('该申请已返还')
    if (!b.returnFileUrl && !b.returnNote) throw badRequest('请上传修改后的文件或填写修改意见')
    if (b.returnFileUrl) assertUploadUrl(b.returnFileUrl)
    const r = await prisma.documentRequest.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnFileUrl: b.returnFileUrl ?? null,
        returnFileName: b.returnFileName ?? null,
        returnNote: b.returnNote ?? null,
        returnedAt: new Date(),
        assignedTeacherId: doc.assignedTeacherId ?? me.id,
      },
      include: docInclude,
    })
    await notifyStudent(doc.studentId, `您的书类修改申请「${doc.title}」已返还`, { link: '/portal/documents' })
    await audit(req, 'return', 'DocumentRequest', id)
    return r
  })

  app.delete('/documents/:id', { preHandler: perm('document.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.documentRequest.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (!r.count) throw notFound('文书申请不存在')
    await audit(req, 'delete', 'DocumentRequest', id)
    return { ok: true }
  })

  app.post('/documents/:id/restore', { preHandler: perm('document.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.documentRequest.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } })
    if (!r.count) throw notFound('回收站中没有该记录')
    await audit(req, 'restore', 'DocumentRequest', id)
    return { ok: true }
  })
}
