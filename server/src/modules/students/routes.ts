import { parseScores } from '../../lib/educonfig'
import type { FastifyInstance } from 'fastify'
import { generatePassword, hashPassword } from '../../lib/password'
import { z } from 'zod'
import { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { parse, pageQuery, pageArgs, paged, zIdParam, zId } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { invalidatePrincipal, perm, staff, staffOnly, hasPerm, scopeWhere, type StaffPrincipal } from '../../plugins/auth'
import { audit } from '../../lib/audit'
import { DICTS } from '../../dict'
import {
  studentSchema,
  validateStudentInput,
  profileData,
  replaceExamsAndAdmissions,
  nextStudentNo,
  studentAccess,
  canEditStudent,
  loadStudentOr404,
  assertCanView,
  UNIVERSITIES,
  normalizeUni,
} from './service'

const listQuery = pageQuery.extend({
  scope: z.enum(['sales', 'teacher', 'all']).optional(),
  q: z.string().trim().optional(),
  status: z.string().optional(),
  campusId: z.coerce.number().int().optional(),
  subjectCategory: z.string().optional(),
  mainTeacherId: z.coerce.number().int().optional(),
  salesId: z.coerce.number().int().optional(),
  enrollTerm: z.string().trim().optional(),
  packageId: z.coerce.number().int().optional(),
  classMode: z.string().optional(),
  /** 1 = 只看已删除（回收站，需 student.all） */
  deleted: z.enum(['0', '1']).optional(),
})

const userLite = { select: { id: true, name: true } } as const

const listSelect = {
  id: true,
  studentNo: true,
  name: true,
  nameAlt: true,
  gender: true,
  phone: true,
  wechat: true,
  status: true,
  campusId: true,
  campus: { select: { id: true, name: true } },
  education: true,
  languageSchool: true,
  subjectCategory: true,
  targetUniversity: true,
  enrollTerm: true,
  enrolledAt: true,
  deletedAt: true,
  sales: userLite,
  mainTeacher: userLite,
  contractTeacher: userLite,
  orders: {
    where: { deletedAt: null, status: { not: 'CANCELLED' } },
    orderBy: { id: 'desc' },
    take: 1,
    select: {
      id: true,
      classMode: true,
      vipHours: true,
      currency: true,
      payableAmount: true,
      paidAmount: true,
      refundedAmount: true,
      status: true,
      package: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.StudentSelect

type ListRow = Prisma.StudentGetPayload<{ select: typeof listSelect }>

function defaultScope(me: StaffPrincipal): 'sales' | 'teacher' | 'all' {
  if (hasPerm(me, 'student.all')) return 'all'
  if (hasPerm(me, 'student.view')) return 'sales'
  return 'teacher'
}

export default async function (app: FastifyInstance) {
  // ---------------- 合格院校搜索建议 ----------------
  app.get('/universities', { preHandler: staffOnly }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().optional() }), req.query)
    const fromDb = await prisma.studentAdmission.findMany({ distinct: ['university'], select: { university: true }, take: 1000 })
    const all = [...new Set([...UNIVERSITIES, ...fromDb.map((r) => r.university)])]
    if (!q) return all.slice(0, 80)
    const nq = normalizeUni(q)
    return all.filter((u) => normalizeUni(u).includes(nq)).slice(0, 50)
  })

  // ---------------- 列表 ----------------
  app.get('/', { preHandler: perm('student.view', 'teacher.students', 'student.all') }, async (req) => {
    const me = staff(req)
    const q = parse(listQuery, req.query)
    const scope = q.scope ?? defaultScope(me)

    const and: Prisma.StudentWhereInput[] = []
    if (scope === 'sales') {
      if (!hasPerm(me, 'student.view')) throw forbidden()
      and.push({ salesId: me.id })
    } else if (scope === 'teacher') {
      if (!hasPerm(me, 'teacher.students')) throw forbidden()
      and.push({ OR: [{ mainTeacherId: me.id }, { contractTeacherId: me.id }] })
    } else {
      if (!hasPerm(me, 'student.all')) throw forbidden()
      and.push(scopeWhere(me) as Prisma.StudentWhereInput)
    }
    if (q.deleted === '1') {
      if (scope !== 'all') throw forbidden()
      and.push({ deletedAt: { not: null } })
    } else and.push({ deletedAt: null })

    if (q.q)
      and.push({
        OR: [
          { name: { contains: q.q } },
          { studentNo: { contains: q.q } },
          { nameAlt: { contains: q.q } },
          { phone: { contains: q.q } },
          { phoneCn: { contains: q.q } },
          { languageSchool: { contains: q.q } },
        ],
      })
    if (q.status) and.push({ status: q.status })
    if (q.campusId) and.push({ campusId: q.campusId })
    if (q.subjectCategory) and.push({ subjectCategory: q.subjectCategory })
    if (q.mainTeacherId) and.push({ mainTeacherId: q.mainTeacherId })
    if (q.salesId && scope !== 'sales') and.push({ salesId: q.salesId })
    if (q.enrollTerm) and.push({ enrollTerm: { contains: q.enrollTerm } })
    if (q.packageId || q.classMode)
      and.push({
        orders: {
          some: {
            deletedAt: null,
            status: { not: 'CANCELLED' },
            ...(q.packageId ? { packageId: q.packageId } : {}),
            ...(q.classMode ? { classMode: q.classMode } : {}),
          },
        },
      })
    const where: Prisma.StudentWhereInput = { AND: and }

    // 排序：在籍优先，再 id desc（分两段分页）
    const { skip, take } = pageArgs(q)
    const wEnrolled: Prisma.StudentWhereInput = { AND: [where, { status: 'ENROLLED' }] }
    const wOther: Prisma.StudentWhereInput = { AND: [where, { status: { not: 'ENROLLED' } }] }
    const [total, nEnrolled] = await Promise.all([prisma.student.count({ where }), prisma.student.count({ where: wEnrolled })])
    const rows: ListRow[] = []
    if (skip < nEnrolled)
      rows.push(...(await prisma.student.findMany({ where: wEnrolled, select: listSelect, orderBy: { id: 'desc' }, skip, take })))
    const remain = take - rows.length
    if (remain > 0)
      rows.push(
        ...(await prisma.student.findMany({ where: wOther, select: listSelect, orderBy: { id: 'desc' }, skip: Math.max(0, skip - nEnrolled), take: remain })),
      )

    const showMoney = scope !== 'teacher' && (hasPerm(me, 'order.view') || hasPerm(me, 'order.all'))
    const items = rows.map(({ orders, ...s }) => {
      const o = orders[0]
      const base = { ...s, packageName: o?.package?.name ?? null, packageId: o?.package?.id ?? null, classMode: o?.classMode ?? null }
      if (!showMoney || !o) return base
      return {
        ...base,
        latestOrder: {
          id: o.id,
          currency: o.currency,
          payableAmount: o.payableAmount,
          paidAmount: o.paidAmount,
          refundedAmount: o.refundedAmount,
          status: o.status,
        },
      }
    })
    return { ...paged(items, total, q), scope }
  })

  // ---------------- 详情 ----------------
  app.get('/:id', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await prisma.student.findFirst({
      where: { id },
      include: {
        campus: { select: { id: true, name: true } },
        sales: userLite,
        mainTeacher: userLite,
        contractTeacher: userLite,
        channel: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        exams: { orderBy: [{ examType: 'asc' }, { attempt: 'asc' }, { id: 'asc' }] },
        admissions: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
        classLinks: {
          include: {
            classGroup: {
              select: { id: true, name: true, subject: true, status: true, startDate: true, endDate: true, deletedAt: true, teacher: userLite },
            },
          },
        },
        vipPackages: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
          select: {
            id: true, name: true, subject: true, totalHours: true, usedHours: true, pendingHours: true, status: true, expireAt: true, orderId: true,
            teachers: { select: { teacher: userLite } },
          },
        },
        orders: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          orderBy: { id: 'desc' },
          take: 1,
          select: { id: true, classMode: true, vipHours: true, package: { select: { id: true, name: true } } },
        },
      },
    })
    if (!s) throw notFound('学员不存在')
    if (s.deletedAt && !hasPerm(me, 'student.all')) throw notFound('学员不存在')
    const access = studentAccess(me, s)
    if (!access.canView) throw forbidden('无权查看该学员')

    const canViewOrders = hasPerm(me, 'order.view') || hasPerm(me, 'order.all')
    let orders: unknown[] | undefined
    if (canViewOrders) {
      const owned = hasPerm(me, 'order.all') || s.salesId === me.id
      orders = await prisma.order.findMany({
        where: { studentId: s.id, deletedAt: null, ...(owned ? {} : { salesId: me.id }) },
        orderBy: { id: 'desc' },
        select: {
          id: true, orderNo: true, classMode: true, vipHours: true, vipContent: true, currency: true, listAmount: true, discountAmount: true,
          payableAmount: true, paidAmount: true, refundedAmount: true, status: true, signedAt: true, expireAt: true,
          package: { select: { id: true, name: true } }, sales: userLite,
        },
      })
    }

    const vip = s.vipPackages.reduce(
      (acc, p) => ({ total: acc.total + p.totalHours, used: acc.used + p.usedHours, pending: acc.pending + p.pendingHours }),
      { total: 0, used: 0, pending: 0 },
    )
    const { portalPasswordHash: _pw, orders: latest, classLinks, ...rest } = s
    return {
      ...rest,
      exams: rest.exams.map((e) => ({ ...e, scores: parseScores(e.scores) })),
      hasPortalPassword: !!_pw,
      packageName: latest[0]?.package?.name ?? null,
      classMode: latest[0]?.classMode ?? null,
      classGroups: classLinks.filter((l) => !l.classGroup.deletedAt).map((l) => ({ ...l.classGroup, joinedAt: l.joinedAt })),
      vipSummary: { ...vip, remaining: vip.total - vip.used - vip.pending },
      ...(canViewOrders ? { orders } : {}),
      access: {
        ...access,
        canEdit: canEditStudent(me, s),
        canViewOrders,
        canManage: hasPerm(me, 'student.edit') && access.canView,
        canDelete: hasPerm(me, 'student.all') && access.byAll,
      },
    }
  })

  // ---------------- 新建（报名第一步） ----------------
  app.post('/', { preHandler: perm('student.enroll') }, async (req) => {
    const me = staff(req)
    const body = parse(studentSchema.extend({ customerId: zId.optional().nullable() }), req.body)
    const { exams, admissions } = await validateStudentInput(body)
    const { customerId, ...input } = body
    const initialPassword = generatePassword()
    const hash = await hashPassword(initialPassword)

    let created: { id: number; studentNo: string } | null = null
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          if (customerId) {
            const c = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null } })
            if (!c) throw notFound('客户不存在')
            if (c.studentId) throw conflict('该客户已转为学员')
          }
          const studentNo = await nextStudentNo(tx)
          const s = await tx.student.create({
            data: {
              ...profileData(input),
              salesId: input.salesId === undefined ? me.id : input.salesId,
              studentNo,
              portalPasswordHash: hash,
            },
            select: { id: true, studentNo: true },
          })
          await replaceExamsAndAdmissions(tx, s.id, exams, admissions)
          if (customerId) await tx.customer.update({ where: { id: customerId }, data: { studentId: s.id, status: 'SIGNED' } })
          return s
        })
      } catch (e) {
        // 学号并发冲突时重试
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue
        throw e
      }
    }
    if (!created) throw conflict('学号生成失败，请重试')
    await audit(req, 'create', 'Student', created.id, { studentNo: created.studentNo, name: input.name, customerId })
    return { id: created.id, studentNo: created.studentNo, initialPassword }
  })

  // ---------------- 编辑档案 ----------------
  app.put('/:id', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await loadStudentOr404(id)
    if (!canEditStudent(me, s)) throw forbidden('无权编辑该学员档案')
    const input = parse(studentSchema, req.body)
    const { exams, admissions } = await validateStudentInput(input)
    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: profileData(input) })
      await replaceExamsAndAdmissions(tx, id, exams, admissions)
    })
    await audit(req, 'update', 'Student', id, { name: input.name })
    return { ok: true }
  })

  // ---------------- 重置学生端密码 ----------------
  app.post('/:id/reset-portal-password', { preHandler: perm('student.edit') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await loadStudentOr404(id)
    assertCanView(me, s)
    const password = generatePassword()
    await prisma.student.update({ where: { id }, data: { portalPasswordHash: await hashPassword(password), portalEnabled: true } })
    invalidatePrincipal('student', id)
    await audit(req, 'reset_password', 'Student', id)
    return { studentNo: s.studentNo, password }
  })

  // ---------------- 状态（在籍 / 休学 / 结业 / 退学） ----------------
  app.post('/:id/status', { preHandler: perm('student.edit') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const body = parse(
      z.object({
        status: z.enum(DICTS.studentStatuses.map((o) => o.value) as [string, ...string[]], { error: '状态无效' }),
        leftAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional()),
      }),
      req.body,
    )
    const s = await loadStudentOr404(id)
    assertCanView(me, s)
    const leaving = body.status === 'LEFT' || body.status === 'GRADUATED'
    await prisma.student.update({
      where: { id },
      data: { status: body.status, leftAt: leaving ? (body.leftAt ?? new Date()) : null },
    })
    await audit(req, 'status', 'Student', id, { from: s.status, to: body.status })
    return { ok: true }
  })

  // ---------------- 删除 / 恢复 ----------------
  app.delete('/:id', { preHandler: perm('student.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await loadStudentOr404(id)
    if (!studentAccess(me, s).byAll) throw forbidden('无权删除该学员')
    await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } })
    await audit(req, 'delete', 'Student', id, { name: s.name, studentNo: s.studentNo })
    return { ok: true }
  })

  app.post('/:id/restore', { preHandler: perm('student.all') }, async (req) => {
    const me = staff(req)
    const { id } = parse(zIdParam, req.params)
    const s = await loadStudentOr404(id, true)
    if (!s.deletedAt) throw badRequest('该学员未被删除')
    if (!studentAccess(me, s).byAll) throw forbidden('无权恢复该学员')
    await prisma.student.update({ where: { id }, data: { deletedAt: null } })
    await audit(req, 'restore', 'Student', id, { name: s.name })
    return { ok: true }
  })
}
