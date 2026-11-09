/**
 * 最先被导入的模块：加载配置文件（默认 server/.env；设置了 DATA_DIR 时为 $DATA_DIR/.env）。
 * ESM 按 import 顺序执行，入口文件第一行 import './env' 可保证之后所有模块都能读到环境变量。
 * 已经存在的环境变量不会被文件覆盖。
 */
import { existsSync } from 'node:fs'
import { ENV_FILE } from './lib/paths'

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
