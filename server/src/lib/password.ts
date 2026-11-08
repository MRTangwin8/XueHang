/**
 * 密码相关的唯一入口：哈希、校验、强度规则、随机初始密码。
 * 所有模块都应调用这里，而不是直接使用 bcrypt。
 */
import bcrypt from 'bcryptjs'
import { randomInt, createHash } from 'node:crypto'
import { z } from 'zod'

/** bcrypt 成本因子（2^12 轮，单次约 200ms，兼顾安全与登录速度） */
const COST = 12

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST)

/** 用户不存在时也做一次等时比对，避免通过响应时间探测账号是否存在 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST)
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH)
    return false
  }
  return bcrypt.compare(plain, hash)
}

/** 旧哈希（成本低于当前标准）在登录成功后需要重新哈希 */
export function needsRehash(hash: string): boolean {
  const m = /^\$2[aby]\$(\d{2})\$/.exec(hash)
  return !m || Number(m[1]) < COST
}

/** 密码强度：8–64 位，至少包含字母和数字 */
export const zStrongPassword = z
  .string()
  .min(8, '密码至少 8 位')
  .max(64, '密码最多 64 位')
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), '密码需同时包含字母和数字')

/** 随机初始密码：10 位，去掉易混淆字符（0/O、1/l/I），含大小写字母和数字 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export function generatePassword(length = 10): string {
  for (;;) {
    let s = ''
    for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)]
    if (/[A-Za-z]/.test(s) && /\d/.test(s)) return s
  }
}

/**
 * 密码版本指纹：写入 JWT，密码修改 / 重置后旧 token 自动失效。
 * 由密码哈希派生，不泄露哈希本身。
 */
export function passwordVersion(hash: string | null | undefined): string {
  return createHash('sha256').update(`pv:${hash ?? ''}`).digest('base64url').slice(0, 12)
}
