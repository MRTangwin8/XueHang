import { t } from '@/i18n'

/** 与后端 lib/password.zStrongPassword 一致的密码规则 */
export const PASSWORD_RULE_TEXT = () => t('profile.passwordRule')

/** 返回错误提示；通过返回 null */
export function checkPassword(p: string): string | null {
  if (p.length < 8) return t('validation.passwordMin')
  if (p.length > 64) return t('validation.passwordMax')
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return t('validation.passwordLetterDigit')
  return null
}
