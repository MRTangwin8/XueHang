import type { RouteRecordRaw } from 'vue-router'

/** 系统设置 */
export default [
  {
    path: 'system/site',
    component: () => import('./views/Site.vue'),
    meta: { title: 'system.menu.site', group: 'system', perm: 'system.site', order: 0 },
  },
  {
    path: 'system/rules',
    component: () => import('./views/Rules.vue'),
    meta: { title: 'system.menu.rules', group: 'system', perm: 'system.rules', order: 1 },
  },
  {
    path: 'system/mail',
    component: () => import('./views/Mail.vue'),
    meta: { title: 'system.menu.mail', group: 'system', perm: 'system.mail', order: 2 },
  },
  {
    path: 'system/users',
    component: () => import('./views/Users.vue'),
    meta: { title: 'system.menu.users', group: 'system', perm: 'system.user', order: 3 },
  },
  {
    path: 'system/roles',
    component: () => import('./views/Roles.vue'),
    meta: { title: 'system.menu.roles', group: 'system', perm: 'system.role', order: 4 },
  },
  {
    path: 'system/campuses',
    component: () => import('./views/Campuses.vue'),
    meta: { title: 'system.menu.campuses', group: 'system', perm: 'system.campus', order: 5 },
  },
  {
    path: 'system/subjects',
    component: () => import('./views/Subjects.vue'),
    meta: { title: 'system.menu.subjects', group: 'system', perm: 'system.subject', order: 6 },
  },
  {
    path: 'system/logs',
    component: () => import('./views/Logs.vue'),
    meta: { title: 'system.menu.logs', group: 'system', perm: 'system.log', order: 7 },
  },
] satisfies RouteRecordRaw[]
