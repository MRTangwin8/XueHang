import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { tt } from '@/i18n'
import { useSite } from '@/stores/site'

/** 浏览器标题：「页面标题 · 站点名」；没有页面标题时用站点的浏览器标题。随语言 / 站点设置变化 */
export function updateTitle(route: RouteLocationNormalizedLoaded) {
  const site = useSite()
  const title = tt(route.meta.title)
  document.title = title ? `${title} · ${site.text('siteName')}` : site.text('browserTitle')
}
