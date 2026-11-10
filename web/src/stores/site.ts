import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, http } from '@/api/http'
import { i18n, t, tList } from '@/i18n'

export interface SiteConfig {
  siteName: string
  siteSubtitle: string
  logoUrl: string | null
  primaryColor: string
  browserTitle: string
  loginTitle: string
  loginSubtitle: string
  heroTitle: string
  heroPoints: string[]
  footerText: string
  portalTitle: string
  portalLoginSubtitle: string
  portalHeroTitle: string
  portalHeroPoints: string[]
}

export function defaultSite(): SiteConfig {
  return {
    siteName: '学航',
    siteSubtitle: '教学管理平台',
    logoUrl: null,
    primaryColor: '#4f46e5',
    browserTitle: '学航 · 教学管理平台',
    loginTitle: '欢迎回来',
    loginSubtitle: '教职工登录',
    heroTitle: '让每一位学生的升学之路\n都清晰可见',
    heroPoints: [
      '教室与课程统一排期，冲突实时提示',
      'VIP 课时账本，待确认 48 小时自动确认',
      '客户跟进、报名缴费、出勤面谈一站管理',
    ],
    footerText: '© 学航 · 教学管理平台',
    portalTitle: '学生端',
    portalLoginSubtitle: '使用学号和密码登录',
    portalHeroTitle: '你的课表、成绩与申请\n都在这里',
    portalHeroPoints: [
      '课表一目了然，上完的课随手确认课时',
      '考试成绩与进步趋势随时查看',
      '在线预约面谈，提交文书与打印申请',
    ],
  }
}

export function mixHex(color: string, target: string, ratio: number): string {
  const channel = (offset: number) => {
    const from = parseInt(color.slice(offset, offset + 2), 16)
    const to = parseInt(target.slice(offset, offset + 2), 16)
    return Math.round(from * (1 - ratio) + to * ratio).toString(16).padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

export const useSite = defineStore('site', () => {
  const config = ref<SiteConfig>(defaultSite())
  async function load() {
    try {
      const response = await http.get<SiteConfig>('/site', { silent: true } as object)
      config.value = { ...defaultSite(), ...response.data }
    } catch {
      config.value = defaultSite()
    }
  }
  async function save(patch: Partial<SiteConfig>) {
    config.value = await api.put<SiteConfig>('/site', patch)
    applyTheme()
  }
  async function reset() {
    config.value = await api.post<SiteConfig>('/site/reset')
    applyTheme()
  }
  function applyTheme() {
    const style = document.documentElement.style
    const primary = config.value.primaryColor
    style.setProperty('--xh-primary', primary)
    style.setProperty('--xh-primary-soft', mixHex(primary, '#ffffff', 0.92))
    style.setProperty('--el-color-primary', primary)
    for (const level of [3, 5, 7, 8, 9]) {
      style.setProperty(`--el-color-primary-light-${level}`, mixHex(primary, '#ffffff', level / 10))
    }
    style.setProperty('--el-color-primary-dark-2', mixHex(primary, '#000000', 0.2))
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.removeAttribute('type')
    icon.href = config.value.logoUrl || '/favicon.svg'
  }
  /**
   * 供界面显示的站点文案：管理员未修改过的字段（仍等于内置默认值）按当前语言翻译；
   * 修改过的字段原样显示（管理员写什么就显示什么）。
   * 用法：site.text('loginTitle')、site.points()
   */
  const defaults = defaultSite()
  type TextField = Exclude<keyof SiteConfig, 'logoUrl' | 'primaryColor' | 'heroPoints' | 'portalHeroPoints'>
  function text(field: TextField): string {
    void i18n.global.locale.value // 建立对语言的响应式依赖
    const v = config.value[field]
    return v === defaults[field] ? t(`site.${field}`) : v
  }
  /** 登录页要点；portal=true 时取学生端的要点 */
  function points(portal = false): string[] {
    void i18n.global.locale.value
    const field = portal ? 'portalHeroPoints' : 'heroPoints'
    const v = config.value[field]
    const d = defaults[field]
    const isDefault = v.length === d.length && v.every((p, i) => p === d[i])
    if (!isDefault) return v
    const tr = tList(`site.${field}`)
    return tr.length ? tr : v
  }

  return { config, load, save, reset, applyTheme, text, points }
})
