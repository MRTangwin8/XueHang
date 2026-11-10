import axios, { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { currentLocale } from '@/i18n'

export const TOKEN_KEY = 'yh_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * axios 实例：baseURL=/api，自动带 token；响应直接返回 data。
 * 错误时自动 ElMessage.error(message)；如需自行处理，传 { silent: true }：
 *   http.post('/x', body, { silent: true } as any)
 * 409 冲突时 error.response.data.details 含冲突明细。
 */
export const http = axios.create({ baseURL: '/api', timeout: 30000 })

http.interceptors.request.use((cfg) => {
  const t = getToken()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  // 让后端按界面语言返回提示信息
  cfg.headers['Accept-Language'] = currentLocale()
  return cfg
})

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiError>) => {
    const status = err.response?.status
    const msg = err.response?.data?.message || err.message || '请求失败'
    const silent = (err.config as { silent?: boolean } | undefined)?.silent
    // 登录 / 找回密码等认证接口返回 401 时是「账号或密码错误」之类的业务提示，直接显示，不当作登录过期
    const authCall = /\/auth\/(login|student-login|forgot|reset|change-password)$/.test(err.config?.url ?? '')
    if (status === 401 && authCall) {
      if (!silent) ElMessage.error(msg)
    } else if (status === 401) {
      setToken(null)
      const portal = location.pathname.startsWith('/portal')
      const target = portal ? '/portal/login' : '/login'
      if (!location.pathname.endsWith('/login')) location.href = `${target}?redirect=${encodeURIComponent(location.pathname + location.search)}`
    } else if (!silent) {
      ElMessage.error(msg)
    }
    return Promise.reject(err)
  },
)

/** 便捷封装：直接拿 data */
export const api = {
  get: <T = unknown>(url: string, params?: object) => http.get<T>(url, { params }).then((r) => r.data),
  post: <T = unknown>(url: string, body?: unknown, cfg?: object) => http.post<T>(url, body, cfg).then((r) => r.data),
  put: <T = unknown>(url: string, body?: unknown, cfg?: object) => http.put<T>(url, body, cfg).then((r) => r.data),
  patch: <T = unknown>(url: string, body?: unknown, cfg?: object) => http.patch<T>(url, body, cfg).then((r) => r.data),
  delete: <T = unknown>(url: string, params?: object) => http.delete<T>(url, { params }).then((r) => r.data),
}

/** 分页返回结构（与后端 paged() 一致） */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
