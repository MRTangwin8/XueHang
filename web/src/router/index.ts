import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { portalOn } from '@/utils/portal'
import { updateTitle } from '@/utils/title'
import { http } from '@/api/http'

/**
 * 模块路由自动收集（新增模块无需改本文件）：
 *   src/modules/<m>/routes.ts         默认导出 RouteRecordRaw[]，挂在后台布局 "/" 下（path 不带前导 /）
 *   src/modules/<m>/portal.routes.ts  默认导出 RouteRecordRaw[]，挂在学生端布局 "/portal" 下
 */
const adminModules = import.meta.glob<{ default: RouteRecordRaw[] }>('../modules/*/routes.ts', { eager: true })
const portalModules = import.meta.glob<{ default: RouteRecordRaw[] }>('../modules/*/portal.routes.ts', { eager: true })

export const adminChildren: RouteRecordRaw[] = Object.values(adminModules).flatMap((m) => m.default)
export const portalChildren: RouteRecordRaw[] = Object.values(portalModules)
  .flatMap((m) => m.default)
  .sort((a, b) => (a.meta?.order ?? 50) - (b.meta?.order ?? 50))

const routes: RouteRecordRaw[] = [
  { path: '/install', component: () => import('@/views/Install.vue'), meta: { public: true, title: 'page.install' } },
  { path: '/forgot-password', component: () => import('@/views/ForgotPassword.vue'), meta: { public: true, title: 'page.forgotPassword' } },
  { path: '/reset-password', component: () => import('@/views/ResetPassword.vue'), meta: { public: true, title: 'page.resetPassword' } },
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { public: true, title: 'page.login' } },
  { path: '/portal/login', component: () => import('@/views/PortalLogin.vue'), meta: { public: true, title: 'page.studentLogin' } },
  {
    path: '/portal',
    component: () => import('@/layouts/PortalLayout.vue'),
    children: [{ path: '', redirect: portalChildren[0]?.path ? `/portal/${portalChildren[0].path}` : '/portal/login' }, ...portalChildren],
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      ...adminChildren,
      { path: 'profile', component: () => import('@/views/Profile.vue'), meta: { title: 'profile.title', hidden: true } },
      { path: '403', component: () => import('@/views/Forbidden.vue'), meta: { title: 'page.forbiddenTitle', hidden: true } },
    ],
  },
  { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFound.vue'), meta: { public: true, title: 'page.notFoundDesc' } },
]

export const router = createRouter({ history: createWebHistory(), routes })

let installStatus: Promise<boolean> | null = null

function isInstalled() {
  if (!installStatus) {
    installStatus = http
      .get<{ installed: boolean }>('/install/status', { silent: true } as never)
      .then((res) => res.data.installed)
      .catch(() => true)
  }
  return installStatus
}

router.beforeEach(async (to) => {
  const installed = await isInstalled()
  if (!installed && to.path !== '/install') return '/install'
  if (installed && to.path === '/install') return '/login'
  const auth = useAuth()
  if (to.meta.public) return true
  const isPortal = to.path.startsWith('/portal')
  const loginPath = isPortal ? '/portal/login' : '/login'
  if (!auth.token) return { path: loginPath, query: { redirect: to.fullPath } }
  if (!auth.me) {
    try {
      await auth.fetchMe()
    } catch {
      return { path: loginPath, query: { redirect: to.fullPath } }
    }
  }
  if (isPortal && auth.me?.type !== 'student') return '/'
  // 学生端：后台关闭的功能（业务规则 → 学生端）直接回首页
  if (isPortal) {
    const dict = useDict()
    await dict.load().catch(() => undefined)
    const key = to.path.split('/')[2] ?? ''
    if (!portalOn(key)) return '/portal/home'
  }
  if (!isPortal && auth.me?.type === 'student') return '/portal'
  if (!isPortal && to.meta.perm && !auth.can(to.meta.perm)) return '/403'
  return true
})

router.afterEach((to) => updateTitle(to))
