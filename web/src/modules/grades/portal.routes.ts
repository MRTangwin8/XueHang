import type { RouteRecordRaw } from 'vue-router'

/** 学生端：我的成绩 */
export default [
  { path: 'grades', component: () => import('./portal/PortalGrades.vue'), meta: { title: 'grades.menu.myGrades', portalNav: true, icon: 'TrendCharts', order: 2 } },
] satisfies RouteRecordRaw[]
