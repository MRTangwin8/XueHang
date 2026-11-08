import { PrismaClient } from '../generated/prisma/client'
import { providerOf } from './dbsetup'

/**
 * Prisma 7 使用驱动适配器连接数据库，按 DATABASE_URL 自动选择：
 *   file:…        SQLite（better-sqlite3）
 *   mysql://…     MySQL / MariaDB（@prisma/adapter-mariadb，选择 MySQL 时由 db:setup 按需安装）
 *   postgresql://… PostgreSQL（@prisma/adapter-pg）
 * 注意：生成的 Prisma 客户端与 schema 的 provider 绑定，切换数据库类型须先运行 npm run db:setup -w server。
 */
const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
/** 连接池上限（MySQL / PostgreSQL），默认 10 */
const poolMax = Number(process.env.DB_POOL_MAX) || 10

async function createAdapter() {
  switch (providerOf(url)) {
    case 'sqlite': {
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
      // timestampFormat：与 Prisma 6 时代写入的数据保持一致（毫秒整数），否则新旧数据格式混杂、日期筛选失效
      return new PrismaBetterSqlite3({ url }, { timestampFormat: 'unixepoch-ms' })
    }
    case 'postgresql': {
      const { PrismaPg } = await import('@prisma/adapter-pg')
      return new PrismaPg({ connectionString: url, max: poolMax })
    }
    case 'mysql': {
      // 模块名放在变量里：未安装 MySQL 驱动时不影响类型检查与其他数据库的使用
      const mod = '@prisma/adapter-mariadb'
      const { PrismaMariaDb } = (await import(/* @vite-ignore */ mod)) as { PrismaMariaDb: new (cfg: object) => unknown }
      const u = new URL(url)
      return new PrismaMariaDb({
        host: u.hostname,
        port: Number(u.port) || 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.slice(1),
        connectionLimit: poolMax,
        // MySQL 8 默认认证方式（caching_sha2_password）在非 TLS 连接时需要获取服务器公钥
        allowPublicKeyRetrieval: true,
      }) as never
    }
  }
}

export const prisma = new PrismaClient({ adapter: await createAdapter() })
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
