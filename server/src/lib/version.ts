/**
 * 版本信息：版本号取自根目录 package.json；提交号和构建时间优先取环境变量
 * （Docker 构建时由 APP_COMMIT / APP_BUILD_TIME 写入），源码运行时回退到 git。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SERVER_ROOT } from './paths'

function baseVersion(): string {
  try {
    return JSON.parse(readFileSync(path.resolve(SERVER_ROOT, '../package.json'), 'utf8')).version ?? ''
  } catch {
    try {
      return JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version ?? ''
    } catch {
      return ''
    }
  }
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: SERVER_ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim()
  } catch {
    return ''
  }
}

const clean = (v: string | undefined, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : '')

export const VERSION_INFO = {
  version: baseVersion() || '0.0.0',
  commit: clean(process.env.APP_COMMIT, /^[0-9a-f]{4,40}$/i).slice(0, 7) || gitCommit(),
  builtAt: clean(process.env.APP_BUILD_TIME, /^[0-9T:.\-+Z ]{8,40}$/),
}
