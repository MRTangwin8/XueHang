/// <reference types="vite/client" />
import 'vue-router'
import type { MenuGroupKey } from './menu'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题，同时作为菜单名 */
    title?: string
    /** 所属菜单分组（见 src/menu.ts）；不填则不进菜单 */
    group?: MenuGroupKey
    /** 需要的权限点，数组表示任一即可；不填 = 登录即可 */
    perm?: string | string[]
    /** 菜单内排序，越小越靠前 */
    order?: number
    /** 不在菜单显示（如详情页） */
    hidden?: boolean
    /** 无需登录 */
    public?: boolean
    /** 学生端底部导航显示 */
    portalNav?: boolean
    /** 学生端导航图标（Element Plus 图标组件名） */
    icon?: string
  }
}
