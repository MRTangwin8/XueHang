import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, getToken, setToken } from '@/api/http'

export interface Me {
  type: 'staff' | 'student'
  id: number
  name: string
  campusId: number | null
  campusName: string | null
  // staff
  staffNo?: string
  identity?: string
  perms?: string[]
  dataScope?: 'SELF' | 'CAMPUS' | 'ALL'
  roleNames?: string[]
  /** 只读（演示 / 审计）账号：只能查看 */
  readOnly?: boolean
  // student
  studentNo?: string
}

const WEAK_KEY = 'yh_weak_pw'
function readWeak(): boolean {
  try {
    return sessionStorage.getItem(WEAK_KEY) === '1'
  } catch {
    return false
  }
}

export const useAuth = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const me = ref<Me | null>(null)
  /** 登录时使用的密码不符合当前密码规则（如初始/演示密码），提示尽快修改 */
  const weakPassword = ref(readWeak())

  const isStaff = computed(() => me.value?.type === 'staff')
  const isStudent = computed(() => me.value?.type === 'student')

  /** 是否拥有任一权限点；不传 = 只要登录 */
  function can(code?: string | string[]): boolean {
    if (!code || (Array.isArray(code) && code.length === 0)) return true
    const perms = me.value?.perms ?? []
    if (perms.includes('*')) return true
    return (Array.isArray(code) ? code : [code]).some((c) => perms.includes(c))
  }

  async function fetchMe() {
    if (!token.value) return null
    me.value = await api.get<Me>('/auth/me')
    return me.value
  }

  async function login(staffNo: string, password: string) {
    const r = await api.post<{ token: string; weakPassword?: boolean }>('/auth/login', { staffNo, password }, { silent: true })
    token.value = r.token
    setToken(r.token)
    setWeak(!!r.weakPassword)
    return fetchMe()
  }

  async function studentLogin(studentNo: string, password: string) {
    const r = await api.post<{ token: string; weakPassword?: boolean }>('/auth/student-login', { studentNo, password }, { silent: true })
    token.value = r.token
    setToken(r.token)
    setWeak(!!r.weakPassword)
    return fetchMe()
  }

  function logout() {
    // 通知后端清除上传文件访问 Cookie（失败也不影响本地退出）
    api.post('/auth/logout', undefined, { silent: true }).catch(() => undefined)
    token.value = null
    me.value = null
    setToken(null)
    setWeak(false)
  }

  /** 修改密码：成功后后端返回新 token（旧 token 全部失效），需替换本地保存的 token */
  async function changePassword(oldPassword: string, newPassword: string) {
    const r = await api.post<{ token: string }>('/auth/change-password', { oldPassword, newPassword })
    token.value = r.token
    setToken(r.token)
    setWeak(false)
  }

  function setWeak(v: boolean) {
    weakPassword.value = v
    try {
      if (v) sessionStorage.setItem(WEAK_KEY, '1')
      else sessionStorage.removeItem(WEAK_KEY)
    } catch {
      /* ignore */
    }
  }

  return { token, me, weakPassword, isStaff, isStudent, can, fetchMe, login, studentLogin, logout, changePassword }
})
