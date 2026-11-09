import { t } from '@/i18n'
import { api, type Paged } from '@/api/http'
import type { Rules } from '@/stores/dict'

export interface ExtendedRules extends Rules {
  customerRecycleEnabled: boolean
  customerRecycleDays: number
  studentNoPrefix: string
  orderNoPrefix: string
  uploadMaxMB: number
}

export interface MailSettings {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  hasPassword: boolean
  fromName: string
  fromAddress: string
  notifyByEmail: boolean
  siteUrl: string
}

export type MailSettingsInput = Omit<MailSettings, 'hasPassword'> & { password?: string }

export const mailApi = {
  get: () => api.get<MailSettings>('/mail'),
  save: (settings: MailSettingsInput) => api.put<MailSettings>('/mail', settings),
  test: (to: string) => api.post<{ ok: true }>('/mail/test', { to }, { silent: true }),
}

export interface EditableDict {
  key: string
  values: string[]
  hidden: string[]
  defaults: string[]
}

export const rulesApi = {
  get: () => api.get<{ rules: ExtendedRules; defaults: ExtendedRules }>('/rules'),
  save: (rules: Partial<ExtendedRules>) => api.put<{ rules: ExtendedRules; defaults: ExtendedRules }>('/rules', rules),
  reset: () => api.post<{ rules: ExtendedRules; defaults: ExtendedRules }>('/rules/reset'),
  dicts: () => api.get<EditableDict[]>('/rules/dicts'),
  saveDict: (key: string, values: string[], hidden: string[]) => api.put(`/rules/dicts/${key}`, { values, hidden }),
  resetDict: (key: string) => api.post(`/rules/dicts/${key}/reset`),
}

export interface Campus {
  id: number
  code: string
  name: string
  address: string | null
  timezone: string
  sort: number
  createdAt: string
  deletedAt: string | null
  userCount: number
  roomCount: number
  studentCount: number
}
export type CampusForm = Pick<Campus, 'code' | 'name' | 'address' | 'timezone' | 'sort'>

export interface Subject {
  id: number
  name: string
  category: string
  sort: number
  active: boolean
  userCount?: number
}
export type SubjectForm = Pick<Subject, 'name' | 'category' | 'sort' | 'active'>

export interface Role {
  id: number
  name: string
  description: string | null
  dataScope: 'SELF' | 'CAMPUS' | 'ALL'
  sort: number
  isSystem: boolean
  /** 只读角色：持有者只能查看，不能修改任何数据 */
  readOnly: boolean
  permissions: string[]
  userCount: number
}
export interface RoleForm {
  name: string
  description: string | null
  dataScope: 'SELF' | 'CAMPUS' | 'ALL'
  sort: number
  readOnly: boolean
  permissions: string[]
}

export interface PermGroup {
  group: string
  items: { code: string; name: string }[]
}

export interface StaffUser {
  id: number
  staffNo: string
  name: string
  phone: string | null
  email: string | null
  identity: string
  status: string
  campusId: number | null
  campus: { id: number; name: string } | null
  hourlyWage: number | null
  transportFee: number | null
  bankName: string | null
  bankBranch: string | null
  bankAccount: string | null
  bankHolder: string | null
  note: string | null
  sort: number
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
  deletedAt: string | null
  roles: { id: number; name: string; isSystem: boolean }[]
  roleIds: number[]
  subjects: { id: number; name: string; category: string; active: boolean }[]
  subjectIds: number[]
}
export interface UserForm {
  staffNo: string
  name: string
  phone: string | null
  email: string | null
  password?: string
  identity: string
  campusId: number | null
  roleIds: number[]
  subjectIds: number[]
  hourlyWage: number | null
  transportFee: number | null
  bankName: string | null
  bankBranch: string | null
  bankAccount: string | null
  bankHolder: string | null
  note: string | null
  sort: number
}
export interface UserQuery {
  page?: number
  pageSize?: number
  q?: string
  identity?: string
  campusId?: number
  roleId?: number
  subjectId?: number
  status?: string
  deleted?: string
}

export interface OpLog {
  id: number
  userId: number | null
  user: { id: number; name: string; staffNo: string } | null
  action: string
  entity: string
  entityId: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}
export interface LogQuery {
  page?: number
  pageSize?: number
  userId?: number
  entity?: string
  action?: string
  from?: string
  to?: string
  q?: string
}

const B = '/system'
export const systemApi = {
  campuses: (deleted = false) => api.get<Campus[]>(`${B}/campuses`, deleted ? { deleted: 1 } : {}),
  createCampus: (f: CampusForm) => api.post<Campus>(`${B}/campuses`, f),
  updateCampus: (id: number, f: CampusForm) => api.put<Campus>(`${B}/campuses/${id}`, f),
  deleteCampus: (id: number) => api.delete(`${B}/campuses/${id}`),
  restoreCampus: (id: number) => api.post(`${B}/campuses/${id}/restore`),

  users: (q: UserQuery) => api.get<Paged<StaffUser>>(`${B}/users`, q),
  user: (id: number) => api.get<StaffUser>(`${B}/users/${id}`),
  createUser: (f: UserForm) => api.post<StaffUser>(`${B}/users`, f),
  updateUser: (id: number, f: UserForm) => api.put<StaffUser>(`${B}/users/${id}`, f),
  resetPassword: (id: number, password: string) => api.post(`${B}/users/${id}/reset-password`, { password }),
  lockUser: (id: number) => api.post(`${B}/users/${id}/lock`),
  unlockUser: (id: number) => api.post(`${B}/users/${id}/unlock`),
  deleteUser: (id: number) => api.delete(`${B}/users/${id}`),
  restoreUser: (id: number) => api.post(`${B}/users/${id}/restore`),

  roles: () => api.get<Role[]>(`${B}/roles`),
  createRole: (f: RoleForm) => api.post<Role>(`${B}/roles`, f),
  updateRole: (id: number, f: RoleForm) => api.put<Role>(`${B}/roles/${id}`, f),
  deleteRole: (id: number) => api.delete(`${B}/roles/${id}`),
  permissions: () => api.get<PermGroup[]>('/auth/permissions'),

  subjects: () => api.get<Subject[]>(`${B}/subjects`),
  subjectCategories: () => api.get<string[]>(`${B}/subject-categories`),
  createSubject: (f: SubjectForm) => api.post<Subject>(`${B}/subjects`, f),
  updateSubject: (id: number, f: SubjectForm) => api.put<Subject>(`${B}/subjects/${id}`, f),
  deleteSubject: (id: number) => api.delete(`${B}/subjects/${id}`),
  restoreSubject: (id: number) => api.post(`${B}/subjects/${id}/restore`),

  logs: (q: LogQuery) => api.get<Paged<OpLog>>(`${B}/logs`, q),
  logFacets: () => api.get<{ entities: string[]; actions: string[] }>(`${B}/logs/facets`),
}

/** 科目按分类分组（保持 categories 顺序，未知分类排在后面） */
export function groupSubjects(list: Subject[], categories: string[] = []) {
  const order = [...categories]
  for (const s of list) if (!order.includes(s.category)) order.push(s.category)
  return order
    .map((category) => ({ category, items: list.filter((s) => s.category === category) }))
    .filter((g) => g.items.length)
}

/** 操作日志：动作 / 对象的中文名 */
export const ACTION_LABELS: Record<string, string> = {
  create: 'common.create',
  update: 'system.action.update',
  delete: 'common.delete',
  restore: 'common.restore',
  login: 'system.action.login',
  confirm: 'system.action.confirm',
  cancel: 'common.cancel',
  lock: 'system.user.lock',
  unlock: 'system.user.unlock',
  'reset-password': 'system.user.resetPassword',
  approve: 'system.action.approve',
  reject: 'system.action.reject',
  assign: 'system.action.assign',
  review: 'system.action.review',
  finish: 'system.action.finish',
  deleteConfirmed: 'system.action.deleteConfirmed',
  studentConfirm: 'system.action.studentConfirm',
  autoConfirm: 'system.action.autoConfirm',
  batchCreate: 'system.action.batchCreate',
  batchUpdate: 'system.action.batchUpdate',
  batchCancel: 'system.action.batchCancel',
  export: 'common.export',
}
export const ENTITY_LABELS: Record<string, string> = {
  Campus: 'common.campus',
  User: 'auth.staffNo',
  Role: 'system.entity.role',
  TeachingSubject: 'system.menu.subjects',
  Customer: 'system.entity.customer',
  FollowUp: 'system.entity.followUp',
  Channel: 'system.entity.channel',
  Organization: 'system.entity.organization',
  Student: 'system.entity.student',
  Order: 'system.entity.order',
  Payment: 'system.entity.payment',
  Refund: 'system.entity.refund',
  CourseProduct: 'system.entity.product',
  Room: 'system.entity.room',
  ClassGroup: 'system.entity.class',
  Session: 'system.entity.session',
  SessionSeries: 'system.entity.series',
  LessonRecord: 'system.entity.lessonRecord',
  InterviewRecord: 'system.entity.interviewRecord',
  VipPackage: 'system.entity.vip',
  Attendance: 'system.entity.attendance',
  InterviewSlot: 'system.entity.slot',
  DocumentRequest: 'system.entity.document',
  PrintRequest: 'system.entity.print',
  Notice: 'system.entity.notice',
  SharedFile: 'system.entity.file',
  WageClaim: 'system.entity.wage',
  DailyReport: 'system.entity.daily',
}
export const actionLabel = (a: string) => ACTION_LABELS[a] ? t(ACTION_LABELS[a]) : a
export const entityLabel = (e: string) => ENTITY_LABELS[e] ? t(ENTITY_LABELS[e]) : e
