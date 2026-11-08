import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../generated/prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zOptStr } from '../../lib/http'
import { notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { perm, staff, staffOnly, hasPerm, type StaffPrincipal } from '../../plugins/auth'
import { assertUploadUrl, toPlainText } from './util'

const AUD = z.enum(['STAFF', 'STUDENT', 'ALL'])

/** 教职工可见：audience STAFF/ALL 且 campusId 为空或本校区 */
type VisibleWhere = { deletedAt: null; audience: { in: string[] }; OR: { campusId: number | null }[] }
export function staffVisible(me: StaffPrincipal): VisibleWhere {
  return {
    deletedAt: null,
    audience: { in: ['STAFF', 'ALL'] },
    OR: [{ campusId: null }, ...(me.campusId ? [{ campusId: me.campusId }] : [])],
  }
}

/** 学生可见：audience STUDENT/ALL 且 campusId 为空或本校区 */
export function studentVisible(campusId: number): VisibleWhere {
  return { deletedAt: null, audience: { in: ['STUDENT', 'ALL'] }, OR: [{ campusId: null }, { campusId }] }
}

const noticeBody = z.object({
  title: z.string().trim().min(1, '请填写标题').max(200),
  content: z.string().min(1, '请填写内容').max(100_000),
  audience: AUD.default('STAFF'),
  pinned: z.boolean().default(false),
  campusId: z.number().int().optional().nullable(),
  publishedAt: z.coerce.date().optional(),
})

const fileBody = z.object({
  title: z.string().trim().min(1, '请填写标题').max(200),
  description: zOptStr,
  fileUrl: z.string().min(1, '请上传文件'),
  fileName: z.string().min(1),
  fileSize: z.number().int().optional().nullable(),
  audience: AUD.default('STAFF'),
  campusId: z.number().int().optional().nullable(),
})

export const noticeSelect = {
  author: { select: { id: true, name: true } },
  campus: { select: { id: true, name: true } },
} satisfies Prisma.NoticeInclude

export default async function (app: FastifyInstance) {
  // ---------------- 通知公告 ----------------
  app.get('/notices', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const q = parse(pageQuery.extend({ q: z.string().optional(), audience: z.string().optional(), manage: z.string().optional() }), req.query)
    const manage = (q.manage === '1' || q.manage === 'true') && hasPerm(me, 'notice.manage')
    const where: Prisma.NoticeWhereInput = manage ? { deletedAt: null } : staffVisible(me)
    if (q.q) where.title = { contains: q.q }
    if (q.audience && manage) where.audience = q.audience
    const [items, total] = await Promise.all([
      prisma.notice.findMany({ where, ...pageArgs(q), orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], include: noticeSelect }),
      prisma.notice.count({ where }),
    ])
    return paged(items, total, q)
  })

  app.get('/notices/:id', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const where: Prisma.NoticeWhereInput = hasPerm(me, 'notice.manage') ? { id, deletedAt: null } : { id, ...staffVisible(me) }
    const n = await prisma.notice.findFirst({ where, include: noticeSelect })
    if (!n) throw notFound('通知不存在')
    return n
  })

  app.post('/notices', { preHandler: perm('notice.manage') }, async (req) => {
    const me = staff(req)
    const b = parse(noticeBody, req.body)
    const n = await prisma.notice.create({ data: { ...b, content: toPlainText(b.content), authorId: me.id, publishedAt: b.publishedAt ?? new Date() } })
    await audit(req, 'create', 'Notice', n.id, { title: n.title })
    return n
  })

  app.put('/notices/:id', { preHandler: perm('notice.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(noticeBody, req.body)
    const old = await prisma.notice.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('通知不存在')
    const n = await prisma.notice.update({ where: { id }, data: { ...b, content: toPlainText(b.content), publishedAt: b.publishedAt ?? old.publishedAt } })
    await audit(req, 'update', 'Notice', id, { title: n.title })
    return n
  })

  app.delete('/notices/:id', { preHandler: perm('notice.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.notice.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (!r.count) throw notFound('通知不存在')
    await audit(req, 'delete', 'Notice', id)
    return { ok: true }
  })

  // ---------------- 资料下载 ----------------
  app.get('/files', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const q = parse(pageQuery.extend({ q: z.string().optional(), audience: z.string().optional(), manage: z.string().optional() }), req.query)
    const manage = (q.manage === '1' || q.manage === 'true') && hasPerm(me, 'file.manage')
    const where: Prisma.SharedFileWhereInput = manage ? { deletedAt: null } : staffVisible(me)
    if (q.q) where.AND = [{ OR: [{ title: { contains: q.q } }, { fileName: { contains: q.q } }, { description: { contains: q.q } }] }]
    if (q.audience && manage) where.audience = q.audience
    const [items, total] = await Promise.all([
      prisma.sharedFile.findMany({
        where,
        ...pageArgs(q),
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true } }, campus: { select: { id: true, name: true } } },
      }),
      prisma.sharedFile.count({ where }),
    ])
    return paged(items, total, q)
  })

  app.post('/files', { preHandler: perm('file.manage') }, async (req) => {
    const me = staff(req)
    const b = parse(fileBody, req.body)
    assertUploadUrl(b.fileUrl)
    const f = await prisma.sharedFile.create({ data: { ...b, uploadedById: me.id } })
    await audit(req, 'create', 'SharedFile', f.id, { title: f.title })
    return f
  })

  app.put('/files/:id', { preHandler: perm('file.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const b = parse(fileBody, req.body)
    assertUploadUrl(b.fileUrl)
    const old = await prisma.sharedFile.findFirst({ where: { id, deletedAt: null } })
    if (!old) throw notFound('资料不存在')
    const f = await prisma.sharedFile.update({ where: { id }, data: b })
    await audit(req, 'update', 'SharedFile', id)
    return f
  })

  app.delete('/files/:id', { preHandler: perm('file.manage') }, async (req) => {
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.sharedFile.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (!r.count) throw notFound('资料不存在')
    await audit(req, 'delete', 'SharedFile', id)
    return { ok: true }
  })
}
