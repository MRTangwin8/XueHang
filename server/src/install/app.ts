/**
 * 安装模式（首次部署，尚未配置 DATABASE_URL 时启用）。
 * 只提供 /api/install/*，不加载任何业务模块与数据库连接。安装完成后由 index.ts 切换到正式应用。
 *
 * 安全：启动时生成一次性「安装码」，打印在服务器控制台并写入 server/.install-token；
 * 测试数据库连接与执行安装都必须提供安装码（防止抢先安装、借数据库测试探测内网）。
 */
import Fastify from 'fastify'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { accessSync, constants, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ensureDriver, providerOf, setupDatabase, type DbProvider } from '../lib/dbsetup'
import { zStrongPassword } from '../lib/password'
import { DATA_DIR, ENV_FILE, SERVER_ROOT, SQLITE_DIR, SQLITE_URL, TOKEN_FILE } from '../lib/paths'
import { registerWebStatic } from '../lib/webstatic'


const dbSchema = z.object({
  type: z.enum(['sqlite', 'mysql', 'postgresql']),
  host: z.string().trim().max(200).default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().trim().max(100).default(''),
  password: z.string().max(200).default(''),
  database: z.string().trim().regex(/^[A-Za-z0-9_\-]{0,64}$/, '数据库名只能包含字母、数字、下划线和短横线').default(''),
})
type DbInput = z.infer<typeof dbSchema>

const installSchema = z.object({
  token: z.string(),
  db: dbSchema,
  siteName: z.string().trim().min(1).max(20).default('学航'),
  campus: z.object({
    name: z.string().trim().min(1).max(50),
    code: z.string().trim().min(1).max(20),
    timezone: z.string().trim().min(1).max(60).default('Asia/Tokyo'),
  }),
  admin: z.object({
    staffNo: z.string().trim().regex(/^[A-Za-z0-9_.\-]{2,30}$/, '工号只能包含字母、数字、下划线、点和短横线（2–30 位）'),
    name: z.string().trim().min(1).max(50),
    password: zStrongPassword,
    email: z.union([z.email(), z.literal('')]).optional(),
  }),
  demoData: z.boolean().default(false),
  /** 演示数据的账号保留公开的演示密码（只用于公开演示站）；否则改为随机密码 */
  keepDemoPasswords: z.boolean().default(false),
  /** 数据库里已有表时，确认清空后再安装 */
  resetExisting: z.boolean().default(false),
  preset: z.string().trim().max(30).default('jp-juku'),
})

export function databaseUrl(db: DbInput): string {
  if (db.type === 'sqlite') return SQLITE_URL
  const auth = db.user ? `${encodeURIComponent(db.user)}${db.password ? ':' + encodeURIComponent(db.password) : ''}@` : ''
  const port = db.port ?? (db.type === 'mysql' ? 3306 : 5432)
  if (!db.database) throw new Error('请填写数据库名')
  return `${db.type}://${auth}${db.host}:${port}/${db.database}`
}

type SqlConn = { query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>; end: () => Promise<void> }

/** 打开一个直连（不经 Prisma），用于测试连接、检查和清空已有表 */
async function openConn(db: DbInput, log: (s: string) => void): Promise<{ conn: SqlConn; version: string; kind: 'mysql' | 'postgresql' }> {
  const url = databaseUrl(db)
  if (providerOf(url) === 'postgresql') {
    const { default: pg } = await import('pg')
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 })
    await c.connect()
    const conn: SqlConn = { query: async (sql, params) => (await c.query(sql, params as unknown[])).rows, end: () => c.end() }
    const r = await conn.query('select version() as v')
    return { conn, version: String(r[0]?.v ?? 'PostgreSQL'), kind: 'postgresql' }
  }
  await ensureDriver('mysql', log)
  const mod = 'mariadb'
  const mariadb = (await import(/* @vite-ignore */ mod)) as { createConnection: (o: object) => Promise<SqlConn> }
  const conn = await mariadb.createConnection({
    host: db.host,
    port: db.port ?? 3306,
    user: db.user,
    password: db.password,
    database: db.database,
    connectTimeout: 8000,
    allowPublicKeyRetrieval: true,
  })
  const rows = await conn.query('select version() as v')
  return { conn, version: `MySQL / MariaDB ${rows[0]?.v ?? ''}`, kind: 'mysql' }
}

async function listTables(conn: SqlConn, kind: 'mysql' | 'postgresql'): Promise<string[]> {
  const rows = kind === 'mysql'
    ? await conn.query("select table_name as t from information_schema.tables where table_schema = database() and table_type = 'BASE TABLE'")
    : await conn.query("select tablename as t from pg_tables where schemaname = current_schema()")
  return rows.map((r) => String(r.t ?? (r as { TABLE_NAME?: string }).TABLE_NAME))
}

/** 测试数据库连通性（不建表），并返回库里已有的表数量 */
async function testConnection(db: DbInput, log: (s: string) => void): Promise<{ version: string; existingTables: number }> {
  if (db.type === 'sqlite') {
    accessSync(SQLITE_DIR, constants.W_OK)
    const file = SQLITE_URL.slice(5)
    const exists = existsSync(path.isAbsolute(file) ? file : path.join(SERVER_ROOT, file)) && statSync(path.isAbsolute(file) ? file : path.join(SERVER_ROOT, file)).size > 0
    return { version: `SQLite：数据文件将保存在 ${DATA_DIR ? file : 'server/prisma/data.db'}`, existingTables: exists ? 1 : 0 }
  }
  const { conn, version, kind } = await openConn(db, log)
  try {
    return { version, existingTables: (await listTables(conn, kind)).length }
  } finally {
    await conn.end()
  }
}

/** 清空目标库里已有的全部表（用户在安装向导里确认后才执行） */
async function dropAllTables(db: DbInput, log: (s: string) => void) {
  if (db.type === 'sqlite') {
    const file = SQLITE_URL.slice(5)
    const full = path.isAbsolute(file) ? file : path.join(SERVER_ROOT, file)
    if (existsSync(full)) {
      const backup = `${full}.bak-${Date.now()}`
      renameSync(full, backup)
      log(`已把原 SQLite 文件改名为 ${path.basename(backup)}\n`)
    }
    return
  }
  const { conn, kind } = await openConn(db, log)
  try {
    const tables = await listTables(conn, kind)
    if (kind === 'mysql') {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0')
      for (const t of tables) await conn.query(`DROP TABLE IF EXISTS \`${t.replace(/`/g, '``')}\``)
      await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    } else {
      for (const t of tables) await conn.query(`DROP TABLE IF EXISTS "${t.replace(/"/g, '""')}" CASCADE`)
    }
    log(`已清空数据库中原有的 ${tables.length} 张表\n`)
  } finally {
    await conn.end()
  }
}

/** 写 server/.env：保留原有其他配置，设置 DATABASE_URL；JWT_SECRET 缺失或过弱时自动生成 */
function writeEnv(url: string) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : []
  const map = new Map<string, string>()
  for (const l of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)
    if (m) map.set(m[1], m[2].replace(/^"(.*)"$/, '$1'))
  }
  map.set('DATABASE_URL', url)
  const secret = map.get('JWT_SECRET') ?? ''
  if (secret.length < 32 || secret === 'dev-only-change-me') map.set('JWT_SECRET', randomBytes(48).toString('base64url'))
  if (!map.has('PORT')) map.set('PORT', process.env.PORT ?? '3001')
  const body = ['# 由安装向导生成，可手动修改（修改后重启服务）', ...[...map].map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)].join('\n') + '\n'
  writeFileSync(ENV_FILE, body, { mode: 0o600 })
  for (const [k, v] of map) process.env[k] = v
}

function runBootstrap(payload: object, url: string, log: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, DATABASE_URL: url, INSTALL_PAYLOAD: JSON.stringify(payload) }
    // 安装参数通过环境变量传给子进程，命令行本身只有常量
    const p = process.platform === 'win32'
      ? spawn('npx tsx scripts/bootstrap.ts', { cwd: SERVER_ROOT, env, shell: true })
      : spawn('npx', ['tsx', 'scripts/bootstrap.ts'], { cwd: SERVER_ROOT, env })
    p.stdout.on('data', (d) => log(String(d)))
    p.stderr.on('data', (d) => log(String(d)))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`初始化数据失败（退出码 ${code}）`))))
  })
}

interface Job {
  state: 'running' | 'done' | 'failed'
  log: string
  error?: string
}

export async function buildInstallApp(onInstalled: () => void) {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 })
  // 安装码：6 位数字 + 6 位字母数字，易于抄写
  const token = `${randomInt(100000, 999999)}-${randomBytes(4).toString('base64url').slice(0, 6)}`
  writeFileSync(TOKEN_FILE, token + '\n', { mode: 0o600 })
  app.log.warn(`\n\n==================== 首次安装 ====================\n请在浏览器打开系统地址完成安装，安装码：${token}\n（安装码也保存在 ${TOKEN_FILE}）\n=================================================\n`)
  const checkToken = (t: string) => {
    const a = Buffer.from(t)
    const b = Buffer.from(token)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  let job: Job | null = null

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Cache-Control', 'no-store')
  })

  app.get('/api/health', async () => ({ ok: true, installMode: true }))
  app.get('/api/install/status', async () => ({ installed: false, running: job?.state === 'running' }))
  /** 可选行业模板（不含数据库访问，安装前即可读取） */
  app.get('/api/install/presets', async () => {
    const { presetSummaries } = await import('../lib/presets-data')
    return presetSummaries()
  })

  /** 环境检查 */
  app.get('/api/install/check', async () => {
    const writable = (p: string) => {
      try {
        accessSync(p, constants.W_OK)
        return true
      } catch {
        return false
      }
    }
    return {
      node: process.version,
      nodeOk: Number(process.versions.node.split('.')[0]) >= 22,
      serverWritable: writable(SERVER_ROOT),
      prismaWritable: writable(path.join(SERVER_ROOT, 'prisma')) && writable(SQLITE_DIR),
      platform: `${process.platform} ${process.arch}`,
    }
  })

  app.post('/api/install/verify-token', async (req, reply) => {
    const { token: t } = z.object({ token: z.string() }).parse(req.body)
    if (!checkToken(t)) return reply.status(403).send({ code: 'BAD_TOKEN', message: '安装码不正确，请查看服务器控制台或 server/.install-token' })
    return { ok: true }
  })

  app.post('/api/install/test-db', async (req, reply) => {
    const b = z.object({ token: z.string(), db: dbSchema }).safeParse(req.body)
    if (!b.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: b.error.issues[0]?.message })
    if (!checkToken(b.data.token)) return reply.status(403).send({ code: 'BAD_TOKEN', message: '安装码不正确' })
    const logs: string[] = []
    try {
      const r = await testConnection(b.data.db, (s) => logs.push(s))
      return { ok: true, version: r.version, existingTables: r.existingTables }
    } catch (e) {
      return reply.status(400).send({ code: 'DB_ERROR', message: `连接失败：${(e as Error).message}`, details: logs.join('') })
    }
  })

  /** 开始安装（后台执行，前端轮询 /api/install/run/status） */
  app.post('/api/install/run', async (req, reply) => {
    const parsed = installSchema.safeParse(req.body)
    if (!parsed.success) {
      const i = parsed.error.issues[0]
      return reply.status(400).send({ code: 'BAD_REQUEST', message: `${i?.path.map(String).join('.')}：${i?.message}` })
    }
    const b = parsed.data
    if (!checkToken(b.token)) return reply.status(403).send({ code: 'BAD_TOKEN', message: '安装码不正确' })
    if (job?.state === 'running') return reply.status(409).send({ code: 'RUNNING', message: '安装正在进行中' })
    const current: Job = { state: 'running', log: '' }
    job = current
    const log = (s: string) => (current.log += s)
    void (async () => {
      try {
        const url = databaseUrl(b.db)
        // 库里已有表（旧版本或其他系统的数据）：必须由用户确认清空，否则不安装
        const { existingTables } = await testConnection(b.db, log)
        if (existingTables > 0) {
          if (!b.resetExisting) throw new Error(`目标数据库中已有 ${existingTables} 张表。请换一个空数据库，或在安装向导中勾选「清空已有的表」后重试`)
          log('0/3 清空数据库中已有的表…\n')
          await dropAllTables(b.db, log)
        }
        log('1/3 初始化数据库…\n')
        await setupDatabase(url, log)
        log('2/3 写入基础数据…\n')
        await runBootstrap({ siteName: b.siteName, campus: b.campus, admin: b.admin, demoData: b.demoData, keepDemoPasswords: b.keepDemoPasswords, preset: b.preset }, url, log)
        log('3/3 保存配置…\n')
        writeEnv(url)
        try {
          unlinkSync(TOKEN_FILE)
        } catch {
          /* ignore */
        }
        current.state = 'done'
        log('安装完成，正在启动系统…\n')
        setTimeout(onInstalled, 1500) // 留时间给前端读取「完成」状态
      } catch (e) {
        current.state = 'failed'
        current.error = (e as Error).message
        log(`\n安装失败：${current.error}\n`)
      }
    })()
    return { ok: true }
  })

  app.get('/api/install/run/status', async () => job ?? { state: 'idle', log: '' })

  // 其他接口在安装完成前一律不可用
  app.all('/api/*', async (_req, reply) => reply.status(503).send({ code: 'NOT_INSTALLED', message: '系统尚未安装' }))
  // 有前端构建产物时直接提供安装页面（Docker / 单进程部署）
  await registerWebStatic(app, true)
  return app
}
