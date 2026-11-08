/**
 * 登录失败限流（进程内存实现，单实例部署足够；多实例部署需换成 Redis）。
 * 同一账号 / 同一 IP 连续失败达到阈值后锁定一段时间；阈值与时长见「业务规则 → 登录安全」。
 */
import { AppError } from './errors'

import { RULES } from '../dict'

// 阈值与锁定时长来自「业务规则 → 登录安全」，每次调用时读取，修改后立即生效
const WINDOW_MS = () => RULES.loginLockMinutes * 60_000
const LOCK_MS = () => RULES.loginLockMinutes * 60_000
const LIMITS = () => ({ account: RULES.loginMaxFailures, ip: RULES.loginIpMaxFailures })

interface Entry {
  count: number
  first: number
  lockedUntil: number
}
const store = new Map<string, Entry>()

function get(key: string, now: number): Entry {
  let e = store.get(key)
  if (!e || (now - e.first > WINDOW_MS() && e.lockedUntil < now)) {
    e = { count: 0, first: now, lockedUntil: 0 }
    store.set(key, e)
  }
  return e
}

/** 登录前调用：若账号或 IP 处于锁定期则抛 429 */
export function assertNotLocked(account: string, ip: string) {
  const now = Date.now()
  for (const key of [`a:${account}`, `i:${ip}`]) {
    const e = store.get(key)
    if (e && e.lockedUntil > now) {
      const min = Math.ceil((e.lockedUntil - now) / 60_000)
      throw new AppError(429, `登录失败次数过多，请 ${min} 分钟后再试`, 'TOO_MANY_ATTEMPTS')
    }
  }
}

/** 登录失败时调用；返回该账号剩余可尝试次数 */
export function recordFailure(account: string, ip: string): number {
  const now = Date.now()
  const a = get(`a:${account}`, now)
  const i = get(`i:${ip}`, now)
  a.count++
  i.count++
  const lim = LIMITS()
  if (a.count >= lim.account) a.lockedUntil = now + LOCK_MS()
  if (i.count >= lim.ip) i.lockedUntil = now + LOCK_MS()
  return Math.max(0, lim.account - a.count)
}

/** 登录成功后清除该账号的失败计数 */
export function recordSuccess(account: string) {
  store.delete(`a:${account}`)
}

// 定期清理过期条目，防止内存增长
setInterval(() => {
  const now = Date.now()
  for (const [k, e] of store) if (now - e.first > WINDOW_MS() && e.lockedUntil < now) store.delete(k)
}, 5 * 60_000).unref()
