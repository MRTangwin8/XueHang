import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 不再自动读取 .env；Node 自带的 loadEnvFile 足够，不额外引入 dotenv
// 设置了 DATA_DIR（Docker）时配置文件在数据目录里
const envFile = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, '.env') : '.env'
if (existsSync(envFile)) process.loadEnvFile(envFile)

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
