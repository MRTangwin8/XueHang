import { languages } from './lang'
import { messages } from './messages'
import { scanMessages } from './scan'

const sources = scanMessages()
let missing = 0
let incomplete = 0
const placeholders = (value: string) => [...new Set(value.match(/\{\d+\}/g) ?? [])].sort().join(',')
for (const [source, locations] of sources) {
  if (!Object.hasOwn(messages, source)) {
    console.error(`缺失：${source}\n  ${locations.join(', ')}`)
    missing++
  }
}
for (const [source, translations] of Object.entries(messages)) {
  for (const lang of languages) {
    if (lang === 'zh-CN') continue
    const text = translations[lang]
    if (!text?.trim() || text === source || placeholders(text) !== placeholders(source)) {
      console.error(`译文缺失或占位符不一致：${lang} — ${source}`)
      incomplete++
    }
  }
}
console.log(`源码提示 ${sources.size} 条；目录 ${Object.keys(messages).length} 条；缺失 ${missing} 条；译文问题 ${incomplete} 项`)
process.exitCode = missing || incomplete ? 1 : 0
