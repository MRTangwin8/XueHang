import type { RouteRecordRaw } from 'vue-router'

/** 成绩管理（学员管理分组）+ 成绩与档案设置（系统设置分组） */
export default [
  {
    path: 'students/grades',
    component: () => import('./views/Assessments.vue'),
    meta: { title: 'grades.menu.grades', group: 'students', perm: ['grade.view', 'grade.enter', 'grade.publish', 'grade.manage'], order: 4 },
  },
  {
    path: 'students/grades/:id(\\d+)',
    component: () => import('./views/AssessmentDetail.vue'),
    meta: { title: 'grades.menu.detail', group: 'students', hidden: true },
  },
  {
    path: 'system/edu',
    component: () => import('./views/EduSettings.vue'),
    meta: { title: 'grades.menu.settings', group: 'system', perm: 'system.edu', order: 1.5 },
  },
] satisfies RouteRecordRaw[]
