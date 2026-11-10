import { useDict } from '@/stores/dict'

/** 学生端可以按需开关的功能（业务规则 → 学生端）；键与学生端路由的 path 一致 */
export const PORTAL_MODULES = ['timetable', 'grades', 'vip', 'interviews', 'documents', 'prints'] as const

/** 学生端某项功能是否开放；规则还没加载时按开放处理 */
export function portalOn(key: string): boolean {
  const list = useDict().rules?.portalModules
  return !list || !(PORTAL_MODULES as readonly string[]).includes(key) || list.includes(key)
}

/** 资料打印：文件类型 → 扩展名 */
export const PRINT_TYPE_EXTS: Record<string, string[]> = {
  pdf: ['.pdf'], jpg: ['.jpg', '.jpeg'], png: ['.png'], word: ['.doc', '.docx'], excel: ['.xls', '.xlsx'], ppt: ['.ppt', '.pptx'],
}
export const PRINT_TYPE_LABEL: Record<string, string> = { pdf: 'PDF', jpg: 'JPG', png: 'PNG', word: 'Word', excel: 'Excel', ppt: 'PowerPoint' }
