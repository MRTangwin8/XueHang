import type { RouteRecordRaw } from 'vue-router'

/** 教务管理 + 教师中心「我的课表」 */
export default [
  { path: 'schedule/board', name: 'schedule-board', component: () => import('./views/Board.vue'), meta: { title: 'schedule.menu.board', group: 'schedule',
    perm: 'schedule.view', order: 1 } },
  { path: 'schedule/timetable', name: 'schedule-timetable', component: () => import('./views/Timetable.vue'), meta: { title: 'schedule.menu.timetable',
    group: 'schedule', perm: 'schedule.view', order: 2 } },
  { path: 'schedule/month', name: 'schedule-month', component: () => import('./views/Month.vue'), meta: { title: 'schedule.menu.month', group: 'schedule',
    perm: 'schedule.view', order: 3 } },
  { path: 'schedule/vip', name: 'schedule-vip', component: () => import('./views/Vip.vue'), meta: { title: 'schedule.menu.vip', group: 'schedule',
    perm: ['vip.manage', 'schedule.own'], order: 4 } },
  { path: 'schedule/classes', name: 'schedule-classes', component: () => import('./views/Classes.vue'), meta: { title: 'schedule.menu.classes',
    group: 'schedule', perm: 'class.manage', order: 5 } },
  { path: 'schedule/rooms', name: 'schedule-rooms', component: () => import('./views/Rooms.vue'), meta: { title: 'schedule.menu.rooms', group: 'schedule',
    perm: 'room.manage', order: 6 } },
  { path: 'teacher/schedule', name: 'teacher-schedule', component: () => import('./views/MySchedule.vue'), meta: { title: 'schedule.menu.mySchedule',
    group: 'teacher', perm: 'schedule.own', order: 2 } },
] satisfies RouteRecordRaw[]
