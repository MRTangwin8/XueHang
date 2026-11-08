import type { RouteRecordRaw } from 'vue-router'

/** 学生端：我的课时 */
export default [
  { path: 'vip', name: 'portal-vip', component: () => import('./views/portal/MyVip.vue'), meta: { title: 'schedule.menu.myHours', portalNav: true,
    icon: 'Clock', order: 2 } },
] satisfies RouteRecordRaw[]
