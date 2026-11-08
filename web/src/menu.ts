/**
 * 后台左侧菜单分组。各模块在 routes.ts 的 meta.group 里引用这些 key，
 * 菜单由路由自动生成（按 meta.order 排序，按权限过滤）。
 */
export const MENU_GROUPS = [
  { key: 'home', title: 'menu.home', icon: 'HomeFilled' },
  { key: 'teacher', title: 'menu.teacher', icon: 'Avatar' },
  { key: 'crm', title: 'menu.crm', icon: 'TrendCharts' },
  { key: 'students', title: 'menu.students', icon: 'UserFilled' },
  { key: 'schedule', title: 'menu.schedule', icon: 'Calendar' },
  { key: 'service', title: 'menu.service', icon: 'Reading' },
  { key: 'hr', title: 'menu.hr', icon: 'Briefcase' },
  { key: 'system', title: 'menu.system', icon: 'Setting' },
] as const

export type MenuGroupKey = (typeof MENU_GROUPS)[number]['key']
