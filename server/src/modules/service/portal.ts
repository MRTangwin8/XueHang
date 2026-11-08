import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zOptStr } from '../../lib/http'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { audit } from '../../lib/audit'
import { notifyUser } from '../../lib/notify'
import { dayjs, fmtZoned } from '../../lib/time'
import { student, studentOnly } from '../../plugins/auth'
import { RULES } from '../../dict'
import { assertUploadUrl, campusTz, computePrintReadyAt, countPdfPages, extOf, printUnitPrice } from './util'
import { kindLabel } from './interviews'
import { noticeSelect, studentVisible } from './notices'

const HOUR = 3_600_000

/** 文书：能否修改及原因 */
function docEditState(d: { lockAt: Date; editCount: number; status: string; deletedAt: Date | null }, now = Date.now()) {
  if (d.deletedAt) return { canEdit: false, reason: '该申请已删除' }
  if (d.status === 'RETURNED') return { canEdit: false, reason: '已返还的申请不能修改' }
  if (now >= +d.lockAt) return { canEdit: false, reason: `已超过${RULES.documentEditHours}小时，申请已锁定，无法再进行任何修改` }
  if (d.editCount >= RULES.documentMaxEdits) return { canEdit: false, reason: `提交后的${RULES.documentEditHours}小时内仅可修改${RULES.documentMaxEdits}次，您已修改过` }
  return { canEdit: true, reason: null as string | null }
}

const slotPublic = {
  id: true,
  kind: true,
  title: true,
  startAt: true,
  endAt: true,
  location: true,
  online: true,
  status: true,
  bookedAt: true,
  bookingNote: true,
  host: { select: { id: true, name: true } },
  campus: { select: { id: true, name: true } },
} as const

const printInput = z.object({
  fileUrl: z.string().min(1, '请上传文件'),
  fileName: z.string().min(1, '请上传文件'),
  colorMode: z.enum(['BW', 'COLOR']),
  pages: z.coerce.number().int().min(1).max(2000).optional().nullable(),
  copies: z.coerce.number().int().min(1, '份数至少为 1').max(100, '份数最多 100').default(1),
  note: zOptStr,
})

/** 计算打印页数 / 费用 / 领取时间 */
async function quotePrint(b: z.infer<typeof printInput>, campusId: number, at = new Date()) {
  assertUploadUrl(b.fileUrl)
  const ext = extOf(b.fileName)
  if (!['.pdf', '.jpg', '.jpeg'].includes(ext) || !['.pdf', '.jpg', '.jpeg'].includes(extOf(b.fileUrl))) throw badRequest('仅限 PDF、JPG 格式文档')
  let pages: number
  let detected = false
  if (ext === '.pdf') {
    const n = await countPdfPages(b.fileUrl)
    if (n) {
      pages = n
      detected = true
    } else if (b.pages) pages = b.pages
    else throw badRequest('无法自动识别 PDF 页数，请填写页数')
  } else pages = 1
  const unit = printUnitPrice(b.colorMode)
  const tz = await campusTz(campusId)
  return { pages, detected, unitPrice: unit, fee: pages * b.copies * unit, readyAt: computePrintReadyAt(at, tz) }
}

export default async function (app: FastifyInstance) {
  const guard = { preHandler: studentOnly }

  // ---------------- 首页聚合 ----------------
  app.get('/portal/home', guard, async (req) => {
    const me = student(req)
    const now = new Date()
    const [notices, bookings, documents, prints, unread] = await Promise.all([
      prisma.notice.findMany({ where: studentVisible(me.campusId), orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], take: 5, select: { id: true, title: true, pinned: true, publishedAt: true } }),
      prisma.interviewSlot.findMany({ where: { studentId: me.id, deletedAt: null, status: 'BOOKED', endAt: { gte: now } }, orderBy: { startAt: 'asc' }, take: 5, select: slotPublic }),
      prisma.documentRequest.findMany({
        where: { studentId: me.id, deletedAt: null },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, status: true, submittedAt: true, dueAt: true, lockAt: true, editCount: true, returnedAt: true },
      }),
      prisma.printRequest.findMany({
        where: { studentId: me.id, deletedAt: null, status: { in: ['PENDING', 'PRINTED'] } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { id: true, fileName: true, status: true, fee: true, readyAt: true, submittedAt: true, pages: true, copies: true, colorMode: true },
      }),
      prisma.notification.count({ where: { studentId: me.id, readAt: null } }),
    ])
    return { notices, bookings, documents, prints, unread }
  })

  // ---------------- 面谈 / 面试预约 ----------------
  app.get('/portal/interview-slots', guard, async (req) => {
    const me = student(req)
    const q = parse(z.object({ kind: z.enum(['CONSULT', 'EXAM']).default('CONSULT') }), req.query)
    const tz = await campusTz(me.campusId)
    const slots = await prisma.interviewSlot.findMany({
      where: { kind: q.kind, status: 'OPEN', deletedAt: null, startAt: { gt: new Date() }, OR: [{ campusId: null }, { campusId: me.campusId }] },
      orderBy: { startAt: 'asc' },
      take: 500,
      select: slotPublic,
    })
    const groups = new Map<string, typeof slots>()
    for (const s of slots) {
      const d = fmtZoned(s.startAt, 'YYYY-MM-DD', tz)
      groups.set(d, [...(groups.get(d) ?? []), s])
    }
    return { kind: q.kind, days: [...groups.entries()].map(([date, items]) => ({ date, weekday: dayjs.tz(date, 'YYYY-MM-DD', tz).isoWeekday(), items })) }
  })

  app.post('/portal/interview-slots/:id/book', guard, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ note: zOptStr }), req.body ?? {})
    const now = new Date()
    // 并发安全：只有仍为 OPEN 的时间段才能被预约
    const r = await prisma.interviewSlot.updateMany({
      where: { id, status: 'OPEN', deletedAt: null, startAt: { gt: now }, OR: [{ campusId: null }, { campusId: me.campusId }] },
      data: { studentId: me.id, status: 'BOOKED', bookedAt: now, bookingNote: b.note ?? null },
    })
    if (!r.count) throw conflict('该时间段已被预约或不可预约，请选择其他时间段')
    const slot = await prisma.interviewSlot.findUniqueOrThrow({ where: { id }, select: { ...slotPublic, hostId: true } })
    await notifyUser(slot.hostId, `新的${kindLabel(slot.kind)}预约：${me.name} ${fmtZoned(slot.startAt)}`, {
      content: slot.title,
      link: slot.kind === 'EXAM' ? '/service/exams' : '/service/interviews',
    })
    return slot
  })

  app.post('/portal/interview-slots/:id/cancel', guard, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    const slot = await prisma.interviewSlot.findFirst({ where: { id, studentId: me.id, deletedAt: null } })
    if (!slot || slot.status !== 'BOOKED') throw notFound('没有找到您的这条预约')
    if (+slot.startAt - Date.now() < RULES.interviewCancelLockHours * HOUR) throw badRequest(`面谈前${RULES.interviewCancelLockHours}小时将无法取消预约`)
    const r = await prisma.interviewSlot.updateMany({
      where: { id, studentId: me.id, status: 'BOOKED', startAt: { gt: new Date(Date.now() + RULES.interviewCancelLockHours * HOUR) } },
      data: { status: 'OPEN', studentId: null, bookedAt: null, bookingNote: null },
    })
    if (!r.count) throw badRequest(`面谈前${RULES.interviewCancelLockHours}小时将无法取消预约`)
    await notifyUser(slot.hostId, `${me.name} 取消了${kindLabel(slot.kind)}预约（${fmtZoned(slot.startAt)}）`, { link: slot.kind === 'EXAM' ? '/service/exams' : '/service/interviews' })
    return { ok: true }
  })

  /** 我的预约 + 记录 */
  app.get('/portal/interviews', guard, async (req) => {
    const me = student(req)
    const [slots, records] = await Promise.all([
      prisma.interviewSlot.findMany({ where: { studentId: me.id, deletedAt: null }, orderBy: { startAt: 'desc' }, take: 100, select: slotPublic }),
      prisma.interviewRecord.findMany({
        where: { studentId: me.id },
        orderBy: { heldAt: 'desc' },
        take: 100,
        select: {
          id: true,
          kind: true,
          heldAt: true,
          durationMin: true,
          japanese: true,
          english: true,
          liberalArts: true,
          math: true,
          targetSchools: true,
          guidance: true,
          teacher: { select: { name: true } },
        },
      }),
    ])
    const lockMs = RULES.interviewCancelLockHours * HOUR
    const now = Date.now()
    return {
      bookings: slots.map((s) => ({ ...s, canCancel: s.status === 'BOOKED' && +s.startAt - now >= lockMs, cancelLockAt: new Date(+s.startAt - lockMs) })),
      records,
    }
  })

  // ---------------- 文书修改 ----------------
  app.get('/portal/documents', guard, async (req) => {
    const me = student(req)
    const rows = await prisma.documentRequest.findMany({
      where: { studentId: me.id, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
      include: { assignedTeacher: { select: { name: true } } },
    })
    const now = Date.now()
    return rows.map((d) => ({ ...d, ...docEditState(d, now) }))
  })

  app.post('/portal/documents', guard, async (req) => {
    const me = student(req)
    const b = parse(
      z.object({
        title: z.string().trim().min(1, '请填写标题').max(100),
        docType: zOptStr,
        fileUrl: z.string().min(1, '请上传文件'),
        fileName: z.string().min(1, '请上传文件'),
        note: zOptStr,
      }),
      req.body,
    )
    if (extOf(b.fileName) !== '.txt' || extOf(b.fileUrl) !== '.txt') throw badRequest('书类修改仅支持上传 txt 文件')
    assertUploadUrl(b.fileUrl)
    const now = dayjs()
    const d = await prisma.documentRequest.create({
      data: {
        studentId: me.id,
        title: b.title,
        docType: b.docType ?? null,
        fileUrl: b.fileUrl,
        fileName: b.fileName,
        note: b.note ?? null,
        submittedAt: now.toDate(),
        lockAt: now.add(RULES.documentEditHours, 'hour').toDate(),
        dueAt: now.add(RULES.documentReturnDays, 'day').toDate(),
      },
    })
    await audit(req, 'create', 'DocumentRequest', d.id)
    return { ...d, ...docEditState(d) }
  })

  app.put('/portal/documents/:id', guard, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    const b = parse(z.object({ fileUrl: z.string().min(1, '请上传文件'), fileName: z.string().min(1, '请上传文件'), note: zOptStr }), req.body)
    if (extOf(b.fileName) !== '.txt' || extOf(b.fileUrl) !== '.txt') throw badRequest('书类修改仅支持上传 txt 文件')
    assertUploadUrl(b.fileUrl)
    const d = await prisma.documentRequest.findFirst({ where: { id, studentId: me.id, deletedAt: null } })
    if (!d) throw notFound('文书申请不存在')
    const st = docEditState(d)
    if (!st.canEdit) throw badRequest(st.reason!)
    // 原子条件更新，防止并发重复修改
    const now = new Date()
    const r = await prisma.documentRequest.updateMany({
      where: { id, studentId: me.id, deletedAt: null, status: { not: 'RETURNED' }, lockAt: { gt: now }, editCount: { lt: RULES.documentMaxEdits } },
      data: { fileUrl: b.fileUrl, fileName: b.fileName, note: b.note ?? null, editCount: { increment: 1 } },
    })
    if (!r.count) throw badRequest('当前申请已不可修改')
    if (d.assignedTeacherId) await notifyUser(d.assignedTeacherId, `${me.name} 更新了书类「${d.title}」`, { link: '/service/documents?mine=1' })
    await audit(req, 'update', 'DocumentRequest', id)
    const fresh = await prisma.documentRequest.findUniqueOrThrow({ where: { id } })
    return { ...fresh, ...docEditState(fresh) }
  })

  // ---------------- 资料打印 ----------------
  /** 试算：页数 / 费用 / 领取时间（不保存） */
  app.post('/portal/prints/quote', guard, async (req) => {
    const me = student(req)
    const b = parse(printInput, req.body)
    return quotePrint(b, me.campusId)
  })

  app.post('/portal/prints', guard, async (req) => {
    const me = student(req)
    const b = parse(printInput, req.body)
    const now = new Date()
    const qt = await quotePrint(b, me.campusId, now)
    const p = await prisma.printRequest.create({
      data: {
        studentId: me.id,
        fileUrl: b.fileUrl,
        fileName: b.fileName,
        colorMode: b.colorMode,
        pages: qt.pages,
        copies: b.copies,
        fee: qt.fee,
        note: b.note ?? null,
        readyAt: qt.readyAt,
        submittedAt: now,
      },
    })
    await audit(req, 'create', 'PrintRequest', p.id)
    return { ...p, detected: qt.detected }
  })

  app.get('/portal/prints', guard, async (req) => {
    const me = student(req)
    return prisma.printRequest.findMany({ where: { studentId: me.id, deletedAt: null }, orderBy: { submittedAt: 'desc' }, take: 200 })
  })

  app.post('/portal/prints/:id/cancel', guard, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    const r = await prisma.printRequest.updateMany({ where: { id, studentId: me.id, status: 'PENDING', deletedAt: null }, data: { status: 'CANCELLED' } })
    if (!r.count) throw badRequest('只有待打印的申请可以取消')
    return { ok: true }
  })

  // ---------------- 通知 / 资料 ----------------
  app.get('/portal/notices', guard, async (req) => {
    const me = student(req)
    const q = parse(pageQuery.extend({ q: z.string().optional() }), req.query)
    const where = { ...studentVisible(me.campusId), ...(q.q ? { title: { contains: q.q } } : {}) }
    const [items, total] = await Promise.all([
      prisma.notice.findMany({ where, ...pageArgs(q), orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], select: { id: true, title: true, pinned: true, publishedAt: true, audience: true } }),
      prisma.notice.count({ where }),
    ])
    return paged(items, total, q)
  })

  app.get('/portal/notices/:id', guard, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    const n = await prisma.notice.findFirst({ where: { id, ...studentVisible(me.campusId) }, include: noticeSelect })
    if (!n) throw notFound('通知不存在')
    return n
  })

  app.get('/portal/files', guard, async (req) => {
    const me = student(req)
    const q = parse(pageQuery.extend({ q: z.string().optional() }), req.query)
    const where = { ...studentVisible(me.campusId), ...(q.q ? { title: { contains: q.q } } : {}) }
    const [items, total] = await Promise.all([
      prisma.sharedFile.findMany({ where, ...pageArgs(q), orderBy: { createdAt: 'desc' }, select: { id: true, title: true, description: true, fileUrl: true, fileName: true, fileSize: true, createdAt: true } }),
      prisma.sharedFile.count({ where }),
    ])
    return paged(items, total, q)
  })
}
