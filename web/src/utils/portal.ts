import { useDict } from '@/stores/dict'

/** 学生端可以按需开关的功能（业务规则 → 学生端）；键与学生端路由的 path 一致 */
export const PORTAL_MODULES = ['timetable', 'grades', 'vip', 'interviews', 'documents', 'prints'] as const

/** 学生端某项功能是否开放；规则还没加载时按开放处理 */
export function portalOn(key: string): boolean {
  const list = useDict().rules?.portalModules
  return !list || !(PORTAL_MODULES as readonly string[]).includes(key) || list.includes(key)
}

/** 学生端首页可选的板块，及它依赖的功能（功能被关闭时该板块自动隐藏） */
export const HOME_SECTIONS: { key: string; needs: string | null; title: string }[] = [
  { key: 'today', needs: 'timetable', title: 'service.text.homeToday' },
  { key: 'grade', needs: 'grades', title: 'service.text.homeLatestGrade' },
  { key: 'vip', needs: 'vip', title: 'service.text.homeVipHours' },
  { key: 'notices', needs: null, title: 'service.text.latestNotices' },
  { key: 'interviews', needs: 'interviews', title: 'service.text.myConsultationsInterviews' },
  { key: 'documents', needs: 'documents', title: 'service.text.documentProgress' },
  { key: 'prints', needs: 'prints', title: 'service.text.printProgress' },
]

/** 首页实际要显示的板块（按后台设置的顺序，去掉功能已关闭的） */
export function homeSections(): string[] {
  const list = useDict().rules?.portalHomeSections ?? HOME_SECTIONS.map((s) => s.key)
  return list.filter((k) => {
    const d = HOME_SECTIONS.find((s) => s.key === k)
    return d && (!d.needs || portalOn(d.needs))
  })
}

/** 资料打印：文件类型 → 扩展名 */
export const PRINT_TYPE_EXTS: Record<string, string[]> = {
  pdf: ['.pdf'], jpg: ['.jpg', '.jpeg'], png: ['.png'], word: ['.doc', '.docx'], excel: ['.xls', '.xlsx'], ppt: ['.ppt', '.pptx'],
}
export const PRINT_TYPE_LABEL: Record<string, string> = { pdf: 'PDF', jpg: 'JPG', png: 'PNG', word: 'Word', excel: 'Excel', ppt: 'PowerPoint' }
