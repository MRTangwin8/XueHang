import type { RouteRecordRaw } from 'vue-router'

/** 信息中心首页 */
export default [
  { path: '', name: 'home', component: () => import('./views/Home.vue'), meta: { title: 'menu.home', group: 'home', order: 1 } },
] satisfies RouteRecordRaw[]
