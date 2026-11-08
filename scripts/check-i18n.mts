/**
 * i18n 检查：npx tsx scripts/check-i18n.mts [模块名...]
 *  1. 每组语言文件（公共 + 各模块）8 种语言的 key 是否与 zh-CN 完全一致
 *  2. 字典翻译（web/src/i18n/dicts）是否覆盖 server/src/dict.ts 的全部字典值；行业模板名称（i18n/names）与模板选项是否都有译文
 *  3. 页面代码里残留的中文（排除 locales、注释、console）
 * 退出码：有问题时为 1
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const WEB = path.join(ROOT, 'web/src')
const CODES = ['zh-CN', 'en', 'ja', 'fr', 'es', 'ru', 'pt', 'de']
const only = process.argv.slice(2)
let problems = 0
const report = (msg: string) => {
  problems++
  console.log('  ✗ ' + msg)
}

function flatten(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj))
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
  return [prefix]
}

async function load(file: string) {
  return (await import(pathToFileURL(file).href)).default
}

async function checkGroup(name: string, dir: string) {
  if (!existsSync(dir)) {
    report(`${name}: 缺少 locales 目录 ${path.relative(ROOT, dir)}`)
    return
  }
  const base = path.join(dir, 'zh-CN.ts')
  if (!existsSync(base)) return report(`${name}: 缺少 zh-CN.ts`)
  const baseKeys = new Set(flatten(await load(base)))
  for (const code of CODES.slice(1)) {
    const f = path.join(dir, `${code}.ts`)
    if (!existsSync(f)) {
      report(`${name}: 缺少 ${code}.ts`)
      continue
    }
    const keys = new Set(flatten(await load(f)))
    const missing = [...baseKeys].filter((k) => !keys.has(k))
    const extra = [...keys].filter((k) => !baseKeys.has(k))
    if (missing.length) report(`${name}/${code}: 缺少 ${missing.length} 个 key，如 ${missing.slice(0, 5).join(', ')}`)
    if (extra.length) report(`${name}/${code}: 多出 ${extra.length} 个 key，如 ${extra.slice(0, 5).join(', ')}`)
  }
}

async function checkDicts() {
  const { DICTS } = await import(pathToFileURL(path.join(ROOT, 'server/src/dict.ts')).href)
  for (const code of CODES.slice(1)) {
    const f = path.join(WEB, 'i18n/dicts', `${code}.ts`)
    if (!existsSync(f)) {
      report(`dicts: 缺少 ${code}.ts`)
      continue
    }
    const tr = await load(f)
    for (const [key, list] of Object.entries(DICTS as Record<string, (string | { value: string })[]>)) {
      for (const o of list) {
        const v = typeof o === 'string' ? o : o.value
        if (!tr[key]?.[v]) report(`dicts/${code}: 缺少 ${key}.${v}`)
      }
    }
  }
}

/** 行业模板：内置名称（names/<code>.ts）与模板下拉选项（dicts/<code>.ts）的译文 */
async function checkPresets() {
  const { PRESETS } = await import(pathToFileURL(path.join(ROOT, 'server/src/lib/presets-data.ts')).href)
  const terms = new Set<string>()
  const dictVals: [string, string][] = []
  for (const p of PRESETS as {
    name: string; description: string; dicts: Record<string, string[]>
    edu: { examTypes: { name: string; group: string; levels: string[]; subjects: { name: string }[] }[]; gradeTemplates: { name: string; subjects: { name: string }[] }[]; profileFields: Record<string, { label?: string }> }
  }[]) {
    terms.add(p.name)
    terms.add(p.description)
    for (const e of p.edu.examTypes) {
      terms.add(e.name)
      if (e.group) terms.add(e.group)
      for (const l of e.levels) if (/[^\x00-\x7f]/.test(l)) terms.add(l)
      for (const s of e.subjects) terms.add(s.name)
    }
    for (const g of p.edu.gradeTemplates) {
      terms.add(g.name)
      for (const s of g.subjects) terms.add(s.name)
    }
    for (const f of Object.values(p.edu.profileFields)) if (f?.label) terms.add(f.label)
    for (const [k, vals] of Object.entries(p.dicts)) for (const v of vals) dictVals.push([k, v])
  }
  for (const code of CODES.slice(1)) {
    const nf = path.join(WEB, 'i18n/names', `${code}.ts`)
    if (!existsSync(nf)) {
      report(`names: 缺少 ${code}.ts`)
      continue
    }
    const names = await load(nf)
    const miss = [...terms].filter((x) => !names[x])
    if (miss.length) report(`names/${code}: 缺少 ${miss.length} 个，如 ${miss.slice(0, 5).join('，')}`)
    const tr = await load(path.join(WEB, 'i18n/dicts', `${code}.ts`))
    const missD = dictVals.filter(([k, v]) => !tr[k]?.[v])
    if (missD.length) report(`dicts/${code}: 缺少模板选项 ${missD.length} 个，如 ${missD.slice(0, 5).map(([k, v]) => `${k}.${v}`).join(', ')}`)
  }
}

/** 残留中文：去掉注释后，在 .vue 模板 / 脚本与 .ts 中查找中日韩字符 */
function scanChinese(dir: string, label: string) {
  const hits: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n)
      if (statSync(p).isDirectory()) {
        if (n === 'locales' || n === 'dicts' || n === 'names') continue
        walk(p)
      } else if (/\.(vue|ts)$/.test(n)) {
        const raw = readFileSync(p, 'utf8')
        const rawLines = raw.split('\n')
        // 去掉注释 / 样式时保留换行，使行号与原文件一致
        const blank = (m: string) => m.replace(/[^\n]/g, '')
        const src = raw
          .replace(/<!--[\s\S]*?-->/g, blank)
          .replace(/\/\*[\s\S]*?\*\//g, blank)
          .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
          .replace(/<style[\s\S]*?<\/style>/g, blank)
        src.split('\n').forEach((line, i) => {
          if (/[一-鿿]/.test(line) && !/console\./.test(line) && !/i18n-ignore/.test(rawLines[i] ?? '')) hits.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 80)}`)
        })
      }
    }
  }
  walk(dir)
  if (hits.length) {
    report(`${label}: 页面代码中仍有 ${hits.length} 行中文（如需保留请在该行加注释 i18n-ignore）`)
    hits.slice(0, 15).forEach((h) => console.log('      ' + h))
  }
}

const modules = readdirSync(path.join(WEB, 'modules')).filter((m) => !only.length || only.includes(m))
console.log('== 公共词条')
if (!only.length || only.includes('core')) {
  await checkGroup('core', path.join(WEB, 'i18n/locales'))
  for (const d of ['layouts', 'views', 'components']) scanChinese(path.join(WEB, d), d)
}
for (const m of modules) {
  console.log(`== 模块 ${m}`)
  await checkGroup(m, path.join(WEB, 'modules', m, 'locales'))
  scanChinese(path.join(WEB, 'modules', m), m)
}
if (!only.length || only.includes('dicts')) {
  console.log('== 字典')
  await checkDicts()
  console.log('== 行业模板')
  await checkPresets()
}
console.log(problems ? `\n共 ${problems} 个问题` : '\n全部通过 ✓')
process.exit(problems ? 1 : 0)
