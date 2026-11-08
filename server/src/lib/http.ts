import { z, type ZodTypeAny } from 'zod'
import { badRequest } from './errors'

/** 校验请求数据，失败抛 400（中文提示第一条错误） */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) {
    const first = r.error.issues[0]
    const path = first?.path.map(String).join('.')
    throw badRequest(`参数错误${path ? `（${path}）` : ''}：${first?.message ?? ''}`, r.error.issues)
  }
  return r.data
}

/** 分页参数：?page=1&pageSize=20 */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
})

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize }
}

/** 统一分页返回结构 */
export function paged<T>(items: T[], total: number, q: { page: number; pageSize: number }) {
  return { items, total, page: q.page, pageSize: q.pageSize }
}

/** 常用 zod 片段 */
export const zId = z.coerce.number().int().positive()
export const zIdParam = z.object({ id: zId })
export const zDate = z.coerce.date()
export const zOptStr = z.string().trim().optional().nullable().transform((v) => (v === '' ? null : v))
/** 逗号分隔或数组的 id 列表 */
export const zIdList = z
  .union([z.array(zId), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(',').filter(Boolean).map(Number)))
