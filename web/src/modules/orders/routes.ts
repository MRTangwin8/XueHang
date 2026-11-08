import type { RouteRecordRaw } from 'vue-router'

/** 订单记录 / 缴费明细 / 退费记录 / 单期课程 / 套餐课程（菜单分组：学员管理） */
export default [
  { path: 'orders/list', component: () => import('./views/OrderList.vue'), meta: { title: "orders.messages.orderRecords", group: 'students', perm:
    ['order.view', 'order.all'], order: 10 } },
  { path: 'orders/payments', component: () => import('./views/Payments.vue'), meta: { title: "orders.messages.paymentDetails", group: 'students',
    perm: ['order.view', 'order.all'], order: 11 } },
  { path: 'orders/refunds', component: () => import('./views/Refunds.vue'), meta: { title: "orders.messages.refundHistory", group: 'students', perm:
    ['order.refund', 'order.all'], order: 12 } },
  { path: 'orders/products', component: () => import('./views/Products.vue'), meta: { title: "orders.messages.singleTermCourse", group: 'students',
    perm: 'product.manage', order: 13 } },
  { path: 'orders/packages', component: () => import('./views/Packages.vue'), meta: { title: "orders.messages.packageCourses", group: 'students',
    perm: 'product.manage', order: 14 } },
] satisfies RouteRecordRaw[]
