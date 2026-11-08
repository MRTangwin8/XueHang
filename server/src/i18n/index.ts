import type { Lang } from './lang'
import { messages } from './messages'

export { pickLang } from './lang'
export type { Lang } from './lang'

const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translations]) => {
  const indices: number[] = []
  const parts = key.split(/(\{\d+\})/g).map((part) => {
    if (/^\{\d+\}$/.test(part)) {
      indices.push(Number(part.slice(1, -1)))
      return '([\\s\\S]*?)'
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  return { key, regex: new RegExp(`^${parts.join('')}$`, 'u'), indices, translations }
}).sort((a, b) => b.key.replace(/\{\d+\}/g, '').length - a.key.replace(/\{\d+\}/g, '').length)

export function translate(message: string, lang: Lang): string {
  function resolve(value: string, depth: number): string {
    if (lang === 'zh-CN' || depth > 20) return value
    const exact = messages[value]?.[lang]
    if (exact !== undefined) return exact
    for (const pattern of patterns) {
      const match = pattern.regex.exec(value)
      if (!match) continue
      const argumentsByIndex = new Map(pattern.indices.map((index, i) => [index, match[i + 1]!]))
      return pattern.translations[lang].replace(/\{(\d+)\}/g, (placeholder, index: string) => {
        const argument = argumentsByIndex.get(Number(index))
        return argument === undefined ? placeholder : resolve(argument, depth + 1)
      })
    }
    return value
  }
  return resolve(message, 0)
}
