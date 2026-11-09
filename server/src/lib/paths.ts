/**
 * 运行时文件位置。
 *
 * 默认（源码部署）：配置在 server/.env，SQLite 在 server/prisma/，上传文件在 server/uploads/。
 * 设置环境变量 DATA_DIR 后（Docker 镜像默认 /data），配置文件、SQLite 数据库、上传文件、安装码
 * 全部放进该目录，挂载成卷即可持久化和备份。
 *
 * 注意：DATA_DIR 必须来自真实的环境变量（它决定 .env 放在哪里，不能写在 .env 里）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null

/** 配置文件（DATABASE_URL、JWT_SECRET 等） */
export const ENV_FILE = path.join(DATA_DIR ?? SERVER_ROOT, '.env')

/** 首次安装的安装码 */
export const TOKEN_FILE = path.join(DATA_DIR ?? SERVER_ROOT, '.install-token')

/** 上传文件根目录 */
export const UPLOAD_DIR = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.resolve(process.cwd(), 'uploads')

/** 安装向导选择 SQLite 时使用的数据库地址 */
export const SQLITE_URL = DATA_DIR ? `file:${path.join(DATA_DIR, 'xuehang.db').replace(/\\/g, '/')}` : 'file:./prisma/data.db'

/** SQLite 数据文件所在目录（安装前检查是否可写） */
export const SQLITE_DIR = DATA_DIR ?? path.join(SERVER_ROOT, 'prisma')

/** 前端构建产物：存在 index.html 时由后端直接提供页面（单容器 / 单进程部署，无需 Nginx） */
export const WEB_DIST = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : path.resolve(SERVER_ROOT, '../web/dist')
