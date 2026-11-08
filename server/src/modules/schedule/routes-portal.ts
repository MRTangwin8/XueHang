/** 学生端：我的课表 / 我的课时 / 确认课时 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse, zIdParam } from '../../lib/http'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { student, studentOnly } from '../../plugins/auth'
import { RULES } from '../../dict'
import { confirmSession, remainingOf } from './service'

export default async function (app: FastifyInstance) {
  /**
   * 我的课表：所在班课的课次 + 本人 VIP 课次（含已取消，便于学生知道停课），最长 62 天。
   * 课堂记录仅在老师设为「学生可见」时返回；班课附带本人出勤状态。
   */
  app.get('/portal/timetable', { preHandler: studentOnly }, async (req) => {
    const me = student(req)
    const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date() }), req.query)
    if (q.to <= q.from) throw badRequest('结束时间必须晚于开始时间')
    if (q.to.getTime() - q.from.getTime() > 62 * 86_400_000) throw badRequest('查询范围最长 62 天')
    const sessions = await prisma.session.findMany({
      where: {
        startAt: { gte: q.from, lt: q.to },
        OR: [
          { kind: 'CLASS', classGroup: { deletedAt: null, students: { some: { studentId: me.id } } } },
          { kind: 'VIP', vipPackage: { studentId: me.id, deletedAt: null } },
        ],
      },
      orderBy: { startAt: 'asc' },
      include: {
        room: { select: { id: true, name: true, building: true } },
        teacher: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
        vipPackage: { select: { id: true, name: true } },
        lessonRecord: { select: { content: true, homework: true, performance: true, studentVisible: true } },
        attendances: { where: { studentId: me.id }, select: { status: true } },
      },
    })
    const now = Date.now()
    return sessions.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      startAt: s.startAt,
      endAt: s.endAt,
      status: s.status,
      hours: s.hours,
      room: s.room,
      teacher: s.teacher,
      classGroup: s.classGroup,
      vipPackage: s.vipPackage,
      attendance: s.attendances[0]?.status ?? null,
      record: s.lessonRecord?.studentVisible ? { content: s.lessonRecord.content, homework: s.lessonRecord.homework, performance: s.lessonRecord.performance } : null,
      canConfirm: s.kind === 'VIP' && RULES.vipStudentConfirm && s.status === 'SCHEDULED' && s.startAt.getTime() <= now,
    }))
  })

  app.get('/portal/vip', { preHandler: studentOnly }, async (req) => {
    const me = student(req)
    const now = Date.now()
    const pkgs = await prisma.vipPackage.findMany({
      where: { studentId: me.id, deletedAt: null },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      include: {
        teachers: { include: { teacher: { select: { id: true, name: true } } } },
        sessions: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { startAt: 'desc' },
          include: {
            room: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
            lessonRecord: { select: { content: true, homework: true, performance: true, studentVisible: true } },
          },
        },
      },
    })
    const autoMs = RULES.vipAutoConfirmHours * 3_600_000
    return {
      autoConfirmEnabled: RULES.vipAutoConfirmEnabled,
      autoConfirmHours: RULES.vipAutoConfirmHours,
      studentCanConfirm: RULES.vipStudentConfirm,
      packages: pkgs.map(({ teachers, sessions, ...p }) => ({
        id: p.id, name: p.name, subject: p.subject, status: p.status, expireAt: p.expireAt,
        totalHours: p.totalHours, usedHours: p.usedHours, pendingHours: p.pendingHours, remaining: remainingOf(p),
        teachers: teachers.map((t) => t.teacher),
        sessions: sessions.map(({ lessonRecord, ...s }) => ({
          id: s.id, title: s.title, startAt: s.startAt, endAt: s.endAt, hours: s.hours, status: s.status,
          confirmedAt: s.confirmedAt, confirmedBy: s.confirmedBy, room: s.room, teacher: s.teacher,
          record: lessonRecord?.studentVisible ? { content: lessonRecord.content, homework: lessonRecord.homework, performance: lessonRecord.performance } : null,
          canConfirm: RULES.vipStudentConfirm && s.status === 'SCHEDULED' && s.startAt.getTime() <= now,
          autoConfirmAt: RULES.vipAutoConfirmEnabled ? new Date(s.endAt.getTime() + autoMs) : null,
        })),
      })),
    }
  })

  app.post('/portal/sessions/:id/confirm', { preHandler: studentOnly }, async (req) => {
    const me = student(req)
    const { id } = parse(zIdParam, req.params)
    if (!RULES.vipStudentConfirm) throw forbidden('学生端确认课时已关闭，请联系老师确认')
    await prisma.$transaction(async (tx) => {
      const s = await tx.session.findFirst({ where: { id, kind: 'VIP', vipPackage: { studentId: me.id } } })
      if (!s) throw notFound('课次不存在')
      if (s.status === 'CONFIRMED') throw badRequest('该课次已确认')
      if (s.status !== 'SCHEDULED') throw badRequest('该课次已取消')
      if (s.startAt.getTime() > Date.now()) throw badRequest('课程尚未开始，不能确认')
      if (!(await confirmSession(tx, id, 'STUDENT'))) throw conflict('课次状态已变化，请刷新')
    })
    await prisma.operationLog.create({ data: { action: 'studentConfirm', entity: 'Session', entityId: String(id), detail: JSON.stringify({ studentId: me.id }), ip: req.ip } })
    return { ok: true }
  })
}
