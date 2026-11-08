import type { RouteRecordRaw } from 'vue-router'

/** 教学服务 / 教师中心 / 人事（工资审核） */
export default [
  { path: 'teacher/notices', component: () => import('./views/TeacherNotices.vue'), meta: { title: 'service.text.schoolNotices', group: 'teacher', order: 1 } },
  { path: 'teacher/files', component: () => import('./views/TeacherFiles.vue'), meta: { title: 'service.text.resources', group: 'teacher', order: 4 } },
  { path: 'teacher/wage', component: () => import('./views/WageClaim.vue'), meta: { title: 'service.text.payClaims',
    group: 'teacher', perm: 'wage.claim', order: 5 } },

  { path: 'service/attendance', component: () => import('./views/Attendance.vue'), meta: {
    title: 'service.text.attendanceManagement', group: 'service', perm: 'attendance.manage', order: 1 } },
  { path: 'service/interviews', component: () => import('./views/Interviews.vue'), props: { kind: 'CONSULT' }, meta: {
    title: 'service.text.consultationBookings', group: 'service', perm: 'interview.manage', order: 2 } },
  { path: 'service/exams', component: () => import('./views/Interviews.vue'), props: { kind: 'EXAM' }, meta: {
    title: 'service.text.interviewBookings', group: 'service', perm: 'interview.manage', order: 3 } },
  { path: 'service/interview-records', component: () => import('./views/InterviewRecords.vue'), meta: {
    title: 'service.text.consultationInterviewRecords', group: 'service', perm: 'interview.manage', order: 4 } },
  { path: 'service/documents', component: () => import('./views/Documents.vue'), meta: { title: 'service.text.documentRevision',
    group: 'service', perm: ['document.manage', 'document.review'], order: 5 } },
  { path: 'service/prints', component: () => import('./views/Prints.vue'), meta: { title: 'service.text.printing', group: 'service',
    perm: 'print.manage', order: 6 } },
  { path: 'service/notices', component: () => import('./views/NoticeManage.vue'), meta: { title: 'service.text.notices',
    group: 'service', perm: 'notice.manage', order: 7 } },
  { path: 'service/files', component: () => import('./views/FileManage.vue'), meta: { title: 'service.text.resourceManagement',
    group: 'service', perm: 'file.manage', order: 8 } },

  { path: 'hr/wage-review', component: () => import('./views/WageReview.vue'), meta: { title: 'service.text.payClaimManagement',
    group: 'hr', perm: 'wage.review', order: 1 } },
  { path: 'hr/wage-scope', component: () => import('./views/WageScope.vue'), meta: { title: 'service.text.payReviewScope',
    group: 'hr', perm: ['system.user', 'system.role'], order: 2 } },
] satisfies RouteRecordRaw[]
