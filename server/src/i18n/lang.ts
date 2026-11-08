export const languages = ['zh-CN', 'en', 'ja', 'fr', 'es', 'ru', 'pt', 'de'] as const
export type Lang = typeof languages[number]
export type TranslationLang = Exclude<Lang, 'zh-CN'>

export function pickLang(acceptLanguage?: string): Lang {
  const choices = (acceptLanguage ?? '').split(',').map((part, index) => {
    const [tag = '', ...parameters] = part.trim().toLowerCase().split(';')
    const quality = parameters.find((p) => p.trim().startsWith('q='))
    const q = quality === undefined ? 1 : Number(quality.trim().slice(2))
    return { tag, q, index }
  }).filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1)
  choices.sort((a, b) => b.q - a.q || a.index - b.index)
  for (const { tag } of choices) {
    if (tag.startsWith('zh')) return 'zh-CN'
    for (const lang of languages) if (lang !== 'zh-CN' && tag.startsWith(lang)) return lang
  }
  return 'zh-CN'
}
