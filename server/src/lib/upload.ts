import { RULES } from '../dict'
import type { FastifyRequest } from 'fastify'
import { createWriteStream, mkdirSync } from 'node:fs'
import { open, stat, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { badRequest } from './errors'
import { dayjs } from './time'

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads')
/** 唯一可匿名访问的子目录（只放站点 Logo） */
export const PUBLIC_DIR = 'public'

/** 预设的上传类型 → 允许的扩展名 */
export const UPLOAD_KINDS: Record<string, string[]> = {
  document: ['.txt'], // 文书修改：仅 txt
  print: ['.pdf', '.jpg', '.jpeg'], // 资料打印：仅 PDF / JPG
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  logo: ['.png', '.jpg', '.jpeg', '.webp'], // 站点 Logo：存公开目录 uploads/public，仅 system.site 可上传
  file: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png', '.zip'],
}

export interface SavedFile {
  url: string
  name: string
  size: number
  /** 磁盘绝对路径（服务端内部用） */
  path: string
}

/** 读取 multipart 中的单个文件并保存到 uploads/YYYYMM/ */
export async function saveUpload(req: FastifyRequest, kind: string): Promise<SavedFile> {
  const allow = UPLOAD_KINDS[kind]
  if (!allow) throw badRequest(`未知上传类型 ${kind}`)
  const file = await req.file({ limits: { fileSize: RULES.uploadMaxMB * 1024 * 1024 } })
  if (!file) throw badRequest('没有收到文件')
  const ext = path.extname(file.filename).toLowerCase()
  if (!allow.includes(ext)) {
    file.file.resume()
    throw badRequest(`仅支持 ${allow.join(' / ')} 格式`)
  }
  const sub = kind === 'logo' ? PUBLIC_DIR : dayjs().format('YYYYMM')
  const dir = path.join(UPLOAD_ROOT, sub)
  mkdirSync(dir, { recursive: true })
  // 128 位随机文件名，不可猜测；原始文件名只存在数据库里
  const stored = `${randomBytes(16).toString('hex')}${ext}`
  const full = path.join(dir, stored)
  await pipeline(file.file, createWriteStream(full))
  if (file.file.truncated) {
    await unlink(full).catch(() => undefined)
    throw badRequest(`文件过大（上限 ${RULES.uploadMaxMB}MB）`)
  }
  if (!(await contentMatches(full, ext))) {
    await unlink(full).catch(() => undefined)
    throw badRequest('文件内容与扩展名不符')
  }
  const { size } = await stat(full)
  return { url: `/uploads/${sub}/${stored}`, name: file.filename, size, path: full }
}

/** 文件头校验：防止把可执行文件 / HTML 改扩展名后上传 */
const MAGIC: Record<string, number[][]> = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
  '.zip': [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]],
  '.docx': [[0x50, 0x4b, 0x03, 0x04]],
  '.xlsx': [[0x50, 0x4b, 0x03, 0x04]],
  '.pptx': [[0x50, 0x4b, 0x03, 0x04]],
  '.doc': [[0xd0, 0xcf, 0x11, 0xe0]],
  '.xls': [[0xd0, 0xcf, 0x11, 0xe0]],
  '.ppt': [[0xd0, 0xcf, 0x11, 0xe0]],
}

async function contentMatches(full: string, ext: string): Promise<boolean> {
  const fh = await open(full, 'r')
  try {
    const buf = Buffer.alloc(4096)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    const head = buf.subarray(0, bytesRead)
    if (ext === '.txt') {
      // 纯文本：不得含 NUL 字节，且不得以 HTML / 脚本标记开头
      return !head.includes(0) && !/^\s*<(!doctype|html|script|svg)/i.test(head.toString('utf8'))
    }
    const sigs = MAGIC[ext]
    if (!sigs) return false
    return sigs.some((sig) => sig.every((b, i) => head[i] === b))
  } finally {
    await fh.close()
  }
}

/** 将 /uploads/... 的 url 转为磁盘路径 */
export function uploadPath(url: string): string {
  const rel = url.replace(/^\/uploads\//, '')
  const full = path.resolve(UPLOAD_ROOT, rel)
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw badRequest('非法路径')
  return full
}
