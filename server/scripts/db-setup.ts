/**
 * 按 server/.env 的 DATABASE_URL 初始化数据库：npm run db:setup -w server
 * （改写 schema 的数据库类型 → 生成 Prisma 客户端 → 建表；不会删除已有数据）
 */
import '../src/env'
import { setupDatabase } from '../src/lib/dbsetup'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('请先在 server/.env 中设置 DATABASE_URL')
  process.exit(1)
}
await setupDatabase(url)
