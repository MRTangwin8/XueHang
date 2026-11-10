/**
 * 数据库初始化：根据 DATABASE_URL 选择数据库类型，改写 schema、生成 Prisma 客户端并建表。
 *   file:./prisma/dev.db                     → SQLite（默认，零配置）
 *   mysql://user:pass@host:3306/db           → MySQL / MariaDB
 *   postgresql://user:pass@host:5432/db      → PostgreSQL
 *
 * 命令行：npm run db:setup -w server（读取 server/.env）；安装向导也调用这里的 setupDatabase()。
 *
 * MySQL 驱动（mariadb，LGPL-2.1）不随项目默认安装，选择 MySQL 时才按需安装，
 * 以保证项目本身的依赖中不含 copyleft 许可。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type DbProvider = 'sqlite' | 'mysql' | 'postgresql'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCHEMA_DIR = path.join(SERVER_ROOT, 'prisma/schema')

/**
 * MySQL 的 String 默认是 VARCHAR(191)，以下可能很长的字段在 MySQL 下改为 TEXT。
 * （SQLite 的 TEXT、PostgreSQL 的 text 本身不限长度，无需处理。）
 */
export const LONG_TEXT_FIELDS: Record<string, string[]> = {
  Campus: ['address'],
  User: ['note'],
  Role: ['description'],
  OperationLog: ['detail'],
  Notification: ['content'],
  Setting: ['value'],
  Organization: ['address', 'rebateRule', 'note'],
  OrgFollowUp: ['content'],
  Customer: ['note'],
  FollowUp: ['content'],
  DailyReport: ['works', 'unfinished', 'contacts', 'issues', 'proposal', 'selfReview'],
  CourseProduct: ['description'],
  Order: ['vipContent', 'note'],
  Payment: ['note'],
  Refund: ['reason'],
  Room: ['note'],
  ClassGroup: ['note'],
  VipPackage: ['note'],
  Session: ['note'],
  LessonRecord: ['content', 'homework', 'performance'],
  Attendance: ['note'],
  InterviewSlot: ['bookingNote'],
  InterviewRecord: ['japanese', 'english', 'liberalArts', 'math', 'targetSchools', 'guidance', 'content'],
  DocumentRequest: ['note', 'returnNote'],
  PrintRequest: ['note'],
  Notice: ['content'],
  SharedFile: ['description'],
  WageClaim: ['content', 'reviewNote'],
  Student: ['address', 'researchTheme', 'note'],
  StudentExam: ['note', 'scores'],
  Assessment: ['subjects', 'note'],
  AssessmentScore: ['scores', 'comment'],
  StudentAdmission: ['note'],
}

export function providerOf(url: string): DbProvider {
  if (url.startsWith('file:')) return 'sqlite'
  if (/^(mysql|mariadb):\/\//.test(url)) return 'mysql'
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgresql'
  throw new Error('不支持的数据库地址，应以 file: / mysql:// / postgresql:// 开头')
}

/** 改写 schema：datasource provider 与 MySQL 长文本字段。返回是否有改动 */
export function rewriteSchema(provider: DbProvider): boolean {
  let changed = false
  const pending = new Map(Object.entries(LONG_TEXT_FIELDS).map(([m, fs]) => [m, new Set(fs)]))
  for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.prisma'))) {
    const full = path.join(SCHEMA_DIR, file)
    const lines = readFileSync(full, 'utf8').split('\n')
    let model: string | null = null
    let inDatasource = false
    const out = lines.map((line) => {
      const m = /^model\s+(\w+)\s*\{/.exec(line)
      if (m) model = m[1]
      if (/^datasource\s+db\s*\{/.test(line)) inDatasource = true
      if (/^\}/.test(line)) {
        model = null
        inDatasource = false
      }
      if (inDatasource && /^\s*provider\s*=/.test(line)) return line.replace(/"[^"]*"/, `"${provider}"`)
      const field = /^(\s+)(\w+)(\s+String\??)(.*)$/.exec(line)
      if (model && field && pending.get(model)?.has(field[2])) {
        pending.get(model)!.delete(field[2])
        const [, indent, name, type, rest] = field
        const restNoText = rest.replace(/\s*@db\.Text\b/, '')
        const [attrs, comment] = splitComment(restNoText)
        const nextAttrs = provider === 'mysql' ? `${attrs} @db.Text` : attrs
        return `${indent}${name}${type}${nextAttrs}${comment}`
      }
      return line
    })
    const next = out.join('\n')
    if (next !== lines.join('\n')) {
      writeFileSync(full, next)
      changed = true
    }
  }
  const missing = [...pending.entries()].flatMap(([m, s]) => [...s].map((f) => `${m}.${f}`))
  if (missing.length) throw new Error(`LONG_TEXT_FIELDS 中的字段在 schema 中不存在：${missing.join(', ')}`)
  return changed
}

/** 把字段行剩余部分拆成「属性」与「行尾注释」两段 */
function splitComment(rest: string): [string, string] {
  const i = rest.indexOf('//')
  if (i < 0) return [rest.trimEnd(), '']
  return [rest.slice(0, i).trimEnd(), ' ' + rest.slice(i)]
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, log: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows 上 npx / npm 是 .cmd，需要经 shell 执行；参数均为代码内常量（无用户输入），拼成一条命令即可
    const p = process.platform === 'win32'
      ? spawn([cmd, ...args].join(' '), { cwd: SERVER_ROOT, env, shell: true })
      : spawn(cmd, args, { cwd: SERVER_ROOT, env })
    p.stdout.on('data', (d) => log(String(d)))
    p.stderr.on('data', (d) => log(String(d)))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}`))))
  })
}

const hasModule = (name: string) =>
  [path.join(SERVER_ROOT, 'node_modules', name), path.join(SERVER_ROOT, '..', 'node_modules', name)].some((p) => existsSync(p))

/** 选择 MySQL 时按需安装驱动适配器（mariadb 驱动为 LGPL-2.1，不随项目默认安装） */
export async function ensureDriver(provider: DbProvider, log: (s: string) => void) {
  if (provider !== 'mysql') return
  if (hasModule('@prisma/adapter-mariadb') && hasModule('mariadb')) return
  log('安装 MySQL 驱动：@prisma/adapter-mariadb、mariadb（LGPL-2.1）…\n')
  // --no-save：不改动 package.json / lockfile（升级代码后重新运行 db:setup 会再次按需安装）
  await run('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@prisma/adapter-mariadb@7.10.1', 'mariadb'], process.env, log)
}

/**
 * 完整初始化：改写 schema → 安装驱动（MySQL）→ 生成客户端 → 建表（db push，不删除已有数据）
 */
export async function setupDatabase(url: string, log: (s: string) => void = (s) => process.stdout.write(s)) {
  const provider = providerOf(url)
  log(`数据库类型：${provider}\n`)
  rewriteSchema(provider)
  await ensureDriver(provider, log)
  // PRISMA_HIDE_UPDATE_MESSAGE：不在安装日志中显示 Prisma 的「有新版本」提示
  const env = { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' }
  await run('npx', ['prisma', 'generate'], env, log)
  await run('npx', ['prisma', 'db', 'push'], env, log)
  log('数据库初始化完成\n')
  return provider
}
