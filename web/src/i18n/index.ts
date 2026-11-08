/**
 * 国际化（vue-i18n，Composition API 模式）。
 *
 * 语言包组成（自动合并，新增模块无需改本文件）：
 *   src/i18n/locales/<locale>.ts            公共词条：common / menu / layout / auth / profile / validation …
 *   src/modules/<m>/locales/<locale>.ts     模块词条，默认导出 { <模块名>: { … } }
 *   src/i18n/dicts/<locale>.ts              业务字典标签翻译（DictSelect / DictTag 使用，见 stores/dict.ts）
 *
 * 用法：
 *   const { t } = useI18n();  t('common.save')
 *   模板中 {{ $t('crm.customer.title') }}
 *   路由 meta.title 可写成词条 key（如 'crm.menu.customers'），菜单 / 面包屑 / 浏览器标题会自动翻译；
 *   写中文也可以（找不到词条时原样显示）。
 */
import { createI18n } from 'vue-i18n'
import { dayjs } from '@/utils/time'
import 'dayjs/locale/en'
import 'dayjs/locale/ja'
import 'dayjs/locale/fr'
import 'dayjs/locale/es'
import 'dayjs/locale/ru'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/de'
import 'dayjs/locale/zh-cn'

export const LOCALES = [
  { code: 'zh-CN', name: '简体中文', dayjs: 'zh-cn' },
  { code: 'en', name: 'English', dayjs: 'en' },
  { code: 'ja', name: '日本語', dayjs: 'ja' },
  { code: 'fr', name: 'Français', dayjs: 'fr' },
  { code: 'es', name: 'Español', dayjs: 'es' },
  { code: 'ru', name: 'Русский', dayjs: 'ru' },
  { code: 'pt', name: 'Português', dayjs: 'pt-br' },
  { code: 'de', name: 'Deutsch', dayjs: 'de' },
] as const
export type LocaleCode = (typeof LOCALES)[number]['code']
export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'
const STORAGE_KEY = 'yh_locale'

type Messages = Record<string, unknown>
const coreFiles = import.meta.glob<{ default: Messages }>('./locales/*.ts', { eager: true })
const moduleFiles = import.meta.glob<{ default: Messages }>('../modules/*/locales/*.ts', { eager: true })

function deepMerge(target: Messages, src: Messages): Messages {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) deepMerge(cur as Messages, v as Messages)
    else target[k] = v
  }
  return target
}

const localeOf = (path: string) => path.split('/').pop()!.replace(/\.ts$/, '')

function buildMessages(): Record<string, Messages> {
  const out: Record<string, Messages> = {}
  for (const [path, mod] of [...Object.entries(coreFiles), ...Object.entries(moduleFiles)]) {
    const code = localeOf(path)
    out[code] = deepMerge(out[code] ?? {}, structuredClone(mod.default))
  }
  return out
}

/** 浏览器语言 → 支持的语言 */
function detect(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LOCALES.some((l) => l.code === saved)) return saved as LocaleCode
  } catch {
    /* ignore */
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const l = lang.toLowerCase()
    if (l.startsWith('zh')) return 'zh-CN'
    const hit = LOCALES.find((x) => l === x.code.toLowerCase() || l.startsWith(x.code.toLowerCase() + '-'))
    if (hit) return hit.code
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detect(),
  fallbackLocale: [DEFAULT_LOCALE, 'en'],
  messages: buildMessages() as never,
  missingWarn: false,
  fallbackWarn: false,
})

export function currentLocale(): LocaleCode {
  return i18n.global.locale.value as LocaleCode
}

/** 切换语言：界面、日期、Element Plus、请求头（Accept-Language）同步切换 */
export function setLocale(code: LocaleCode) {
  i18n.global.locale.value = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* ignore */
  }
  applyLocaleSideEffects(code)
}

export function applyLocaleSideEffects(code: LocaleCode = currentLocale()) {
  document.documentElement.lang = code
  dayjs.locale(LOCALES.find((l) => l.code === code)?.dayjs ?? 'zh-cn')
}

/**
 * 翻译「可能是词条 key，也可能是普通文字」的字符串：
 * 有该词条就翻译，否则原样返回（用于路由标题、菜单等渐进迁移的场景）。
 */
// vue-i18n 的泛型签名在 key 为任意字符串时会触发 TS2589，这里收窄为简单函数签名
const g = i18n.global as unknown as {
  t: (key: string, named?: Record<string, unknown>) => string
  te: (key: string, locale?: string) => boolean
  tm: (key: string) => unknown
  rt: (message: unknown) => string
}

export function tt(s: string | undefined | null): string {
  if (!s) return ''
  return g.te(s) || g.te(s, DEFAULT_LOCALE) ? g.t(s) : s
}

/** 在组件外（store、工具函数）使用的翻译函数 */
export const t = (key: string, named?: Record<string, unknown>): string => (named ? g.t(key, named) : g.t(key))

/** 取数组 / 对象词条（如 site.heroPoints），并解析为字符串数组 */
export function tList(key: string): string[] {
  const raw = g.tm(key)
  return Array.isArray(raw) ? raw.map((m) => g.rt(m)) : []
}
