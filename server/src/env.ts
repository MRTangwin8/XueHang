/**
 * 最先被导入的模块：加载 server/.env。
 * ESM 按 import 顺序执行，入口文件第一行 import './env' 可保证之后所有模块都能读到环境变量。
 */
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
