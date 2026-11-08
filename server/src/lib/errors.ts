export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details)
export const unauthorized = (msg = '请先登录') => new AppError(401, msg, 'UNAUTHORIZED')
export const forbidden = (msg = '没有权限执行此操作') => new AppError(403, msg, 'FORBIDDEN')
export const notFound = (msg = '记录不存在') => new AppError(404, msg, 'NOT_FOUND')
/** 业务冲突，例如教室时间冲突；details 里放冲突明细供前端展示 */
export const conflict = (msg: string, details?: unknown) => new AppError(409, msg, 'CONFLICT', details)
