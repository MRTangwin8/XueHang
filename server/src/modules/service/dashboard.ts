import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { staff, staffOnly, hasPerm, scopeWhere } from '../../plugins/auth'
import type { Prisma } from '../../generated/prisma/client'
import { campusTz, dayRange } from './util'
import { staffVisible } from './notices'

interface Todo {
  key: string
  label: string
  count: number
  link: string
  tone: 'primary' | 'warning' | 'danger' | 'success' | 'info'
  icon: string
}

/** 首页看板：最新通知 / 资料 / 我的待办 / 今日课程 / 今日面谈 */
export default async function (app: FastifyInstance) {
  app.get('/dashboard', { preHandler: staffOnly }, async (req) => {
    const me = staff(req)
    const tz = await campusTz(me.campusId)
    const today = dayRange(new Date(), tz)
    const vis = staffVisible(me)

    const [notices, files, todaySessions, todayInterviews] = await Promise.all([
      prisma.notice.findMany({
        where: vis,
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        take: 5,
        select: { id: true, title: true, pinned: true, publishedAt: true, audience: true, author: { select: { name: true } } },
      }),
      prisma.sharedFile.findMany({
        where: vis,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, fileName: true, fileUrl: true, fileSize: true, createdAt: true },
      }),
      prisma.session.findMany({
        where: { teacherId: me.id, status: { not: 'CANCELLED' }, startAt: { gte: today.start, lt: today.end } },
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          kind: true,
          title: true,
          startAt: true,
          endAt: true,
          status: true,
          classGroupId: true,
          room: { select: { name: true } },
          classGroup: { select: { _count: { select: { students: true } } } },
          vipPackage: { select: { student: { select: { name: true } } } },
          _count: { select: { attendances: true } },
        },
      }),
      prisma.interviewSlot.findMany({
        where: { hostId: me.id, deletedAt: null, status: { in: ['BOOKED', 'DONE'] }, startAt: { gte: today.start, lt: today.end } },
        orderBy: { startAt: 'asc' },
        select: { id: true, kind: true, title: true, startAt: true, endAt: true, status: true, location: true, online: true, student: { select: { id: true, name: true, studentNo: true } } },
      }),
    ])

    const todos: Todo[] = []
    const docBase: Prisma.DocumentRequestWhereInput = { deletedAt: null }
    if (hasPerm(me, 'document.review') || hasPerm(me, 'document.manage')) {
      const n = await prisma.documentRequest.count({ where: { ...docBase, assignedTeacherId: me.id, status: 'ASSIGNED' } })
      todos.push({ key: 'docAssigned', label: '待我批改的文书', count: n, link: '/service/documents?mine=1', tone: 'warning', icon: 'EditPen' })
    }
    if (hasPerm(me, 'document.manage')) {
      const n = await prisma.documentRequest.count({ where: { ...docBase, status: 'SUBMITTED' } })
      todos.push({ key: 'docUnassigned', label: '待分配文书', count: n, link: '/service/documents?status=SUBMITTED', tone: 'danger', icon: 'Document' })
    }
    if (hasPerm(me, 'wage.review')) {
      const n = await prisma.wageClaim.count({ where: { deletedAt: null, status: 'PENDING', user: scopeWhere(me) as Prisma.UserWhereInput } })
      todos.push({ key: 'wagePending', label: '待审核工资', count: n, link: '/hr/wage-review?status=PENDING', tone: 'primary', icon: 'Money' })
    }
    if (hasPerm(me, 'print.manage')) {
      const n = await prisma.printRequest.count({ where: { deletedAt: null, status: 'PENDING', student: scopeWhere(me) as Prisma.StudentWhereInput } })
      todos.push({ key: 'printPending', label: '待打印资料', count: n, link: '/service/prints?status=PENDING', tone: 'warning', icon: 'Printer' })
    }
    todos.push({ key: 'todaySessions', label: '今日我的课程', count: todaySessions.length, link: '#today', tone: 'success', icon: 'Calendar' })
    if (hasPerm(me, 'interview.manage') || todayInterviews.length)
      todos.push({ key: 'todayInterviews', label: '今日我的面谈', count: todayInterviews.length, link: '/service/interviews', tone: 'info', icon: 'ChatDotRound' })

    return {
      notices,
      files,
      todos,
      todaySessions: todaySessions.map(({ classGroup, vipPackage, _count, ...s }) => ({
        ...s,
        studentCount: classGroup?._count.students ?? (vipPackage ? 1 : 0),
        studentName: vipPackage?.student.name ?? null,
        attendanceRecorded: _count.attendances,
      })),
      todayInterviews,
    }
  })
}
