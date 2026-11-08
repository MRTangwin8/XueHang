import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 不再自动读取 .env；Node 自带的 loadEnvFile 足够，不额外引入 dotenv
if (existsSync('.env')) process.loadEnvFile('.env')

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
