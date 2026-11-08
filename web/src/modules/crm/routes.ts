import type { RouteRecordRaw } from 'vue-router'

const CustomerList = () => import('./views/CustomerList.vue')

/** 客户信息管理（CRM） */
export default [
  {
    path: 'crm/customers',
    name: 'crm-customers',
    component: CustomerList,
    props: { scope: 'mine' },
    meta: { title: 'crm.menu.myCustomers', group: 'crm', perm: 'crm.customer.view', order: 1 },
  },
  {
    path: 'crm/pool',
    name: 'crm-pool',
    component: CustomerList,
    props: { scope: 'pool' },
    meta: { title: 'crm.menu.unassignedCustomers', group: 'crm', perm: 'crm.pool', order: 2 },
  },
  {
    path: 'crm/all',
    name: 'crm-all',
    component: CustomerList,
    props: { scope: 'all' },
    meta: { title: 'crm.menu.allCustomers', group: 'crm', perm: 'crm.customer.all', order: 3 },
  },
  {
    path: 'crm/daily',
    name: 'crm-daily',
    component: () => import('./views/MyDaily.vue'),
    meta: { title: 'crm.menu.myDailyReports', group: 'home', perm: 'daily.write', order: 2 },
  },
  {
    path: 'crm/daily-all',
    name: 'crm-daily-all',
    component: () => import('./views/DailyAll.vue'),
    meta: { title: 'crm.menu.teamDailyReports', group: 'home', perm: 'crm.daily.all', order: 3 },
  },
  {
    path: 'crm/stats',
    name: 'crm-stats',
    component: () => import('./views/Stats.vue'),
    meta: { title: 'crm.menu.reportsAndStatistics', group: 'crm', perm: 'crm.report', order: 6 },
  },
  {
    path: 'crm/ranking',
    name: 'crm-ranking',
    component: () => import('./views/Ranking.vue'),
    meta: { title: 'crm.menu.salesRanking', group: 'crm', perm: 'crm.report', order: 7 },
  },
  {
    path: 'crm/channels',
    name: 'crm-channels',
    component: () => import('./views/Channels.vue'),
    meta: { title: 'crm.menu.channelManagement', group: 'crm', perm: 'crm.channel', order: 8 },
  },
  {
    path: 'crm/organizations',
    name: 'crm-organizations',
    component: () => import('./views/Organizations.vue'),
    meta: { title: 'crm.menu.partnerOrganizations', group: 'crm', perm: 'crm.channel', order: 9 },
  },
] satisfies RouteRecordRaw[]
