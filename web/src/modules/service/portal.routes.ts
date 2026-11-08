import type { RouteRecordRaw } from 'vue-router'

/** 学生端（挂在 /portal 下） */
export default [
  { path: 'home', component: () => import('./portal/PortalHome.vue'), meta: { title: 'service.text.home', portalNav: true, icon: 'HomeFilled', order: 1 } },
  { path: 'interviews', component: () => import('./portal/PortalInterviews.vue'), meta: {
    title: 'service.text.consultationBookings', portalNav: true, icon: 'ChatDotRound', order: 3 } },
  { path: 'documents', component: () => import('./portal/PortalDocuments.vue'), meta: { title: 'service.text.documentRevision',
    portalNav: true, icon: 'EditPen', order: 4 } },
  { path: 'prints', component: () => import('./portal/PortalPrints.vue'), meta: { title: 'service.text.printing', portalNav: true,
    icon: 'Printer', order: 5 } },
  { path: 'notices', component: () => import('./portal/PortalNotices.vue'), meta: { title: 'service.text.notices', order: 89 } },
  { path: 'notices/:id', component: () => import('./portal/PortalNoticeDetail.vue'), meta: { title: 'service.text.noticeDetails', order: 90 } },
  { path: 'files', component: () => import('./portal/PortalFiles.vue'), meta: { title: 'service.text.resources', order: 91 } },
] satisfies RouteRecordRaw[]
