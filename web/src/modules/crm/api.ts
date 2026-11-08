import { api, type Paged } from '@/api/http'
import { toApi, tz } from '@/utils/time'

export interface IdName {
  id: number
  name: string
}

export interface Customer {
  id: number
  campusId: number
  name: string
  gender: string | null
  phone: string | null
  wechat: string | null
  qq: string | null
  email: string | null
  province: string | null
  city: string | null
  education: string | null
  currentSchool: string | null
  subjectCategory: string | null
  targetSchool: string | null
  intentLevel: string
  status: string
  source: string | null
  channelId: number | null
  organizationId: number | null
  ownerId: number | null
  assignedAt: string | null
  lastFollowAt: string | null
  nextFollowAt: string | null
  studentId: number | null
  note: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  owner: IdName | null
  channel: IdName | null
  organization: IdName | null
  campus: IdName | null
  student: { id: number; name: string; studentNo: string; status?: string } | null
  followCount: number
}

export interface FollowUp {
  id: number
  customerId: number
  userId: number
  method: string
  content: string
  intentLevel: string | null
  isVisit: boolean
  nextFollowAt: string | null
  createdAt: string
  user: IdName
}

export interface CustomerDetail extends Customer {
  followUps: FollowUp[]
  canEdit: boolean
}

export interface DuplicateCustomer {
  /** restricted=true 时（无权查看的客户）以下身份字段为 null */
  id: number | null
  name: string | null
  phone: string | null
  wechat: string | null
  qq: string | null
  status: string | null
  studentId: number | null
  restricted?: boolean
  owner: IdName | null
  campus: IdName | null
  matched: string[]
}

export interface Channel {
  id: number
  name: string
  sort: number
  active: boolean
  customerCount: number
  studentCount: number
}

export interface Organization {
  id: number
  campusId: number | null
  name: string
  type: string | null
  province: string | null
  city: string | null
  address: string | null
  contactName: string | null
  contactPhone: string | null
  wechat: string | null
  rebateRule: string | null
  rebateRateClass: number | null
  rebateRateVip: number | null
  bankName: string | null
  bankAccount: string | null
  bankHolder: string | null
  status: string
  signedAt: string | null
  ownerId: number | null
  note: string | null
  createdAt: string
  deletedAt: string | null
  owner: IdName | null
  campus: IdName | null
  customerCount: number
  studentCount: number
  followCount?: number
  lastFollowAt?: string | null
}

export interface OrgFollowUp {
  id: number
  method: string
  content: string
  followAt: string
  user: IdName
}

export interface OrganizationDetail extends Organization {
  followUps: OrgFollowUp[]
  customers: { id: number; name: string; status: string; intentLevel: string; owner: { name: string } | null; createdAt: string }[]
  students: { id: number; name: string; studentNo: string; status: string }[]
}

export interface DailyReport {
  id: number
  userId: number
  reportDate: string
  works: string
  unfinished: string | null
  contacts: string | null
  newCustomers: number
  visits: number
  issues: string | null
  proposal: string | null
  selfReview: string | null
  readById: number | null
  readAt: string | null
  readByName?: string | null
  createdAt: string
  updatedAt: string
  user?: { id: number; name: string; staffNo: string; campus: { name: string } | null }
}

export interface Overview {
  from: string
  to: string
  summary: {
    newCustomers: number
    followUps: number
    visits: number
    visitCustomers: number
    signedOfNew: number
    conversionRate: number
    signedInPeriod: number
  }
  byChannel: { id: number | null; name: string; total: number; signed: number; rate: number }[]
  byIntent: { level: string; total: number }[]
  byStatus: { status: string; total: number }[]
  bySource: { name: string; total: number }[]
  trend: { date: string; newCustomers: number; followUps: number; visits: number; signed: number }[]
}

export type Money = Record<string, number>
export interface RankingRow {
  rank: number
  userId: number
  name: string
  staffNo: string
  campusName: string | null
  newCustomers: number
  followUps: number
  signed: number
  orders: number
  payable: Money
  paid: Money
  conversionRate: number
}
export interface Ranking {
  from: string
  to: string
  items: RankingRow[]
  total: { newCustomers: number; followUps: number; signed: number; orders: number; payable: Money; paid: Money }
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false))

export const crmApi = {
  // 客户
  customers: (params: Record<string, unknown>) => api.get<Paged<Customer>>('/crm/customers', clean(params)),
  customer: (id: number) => api.get<CustomerDetail>(`/crm/customers/${id}`),
  checkDuplicate: (params: { phone?: string | null; wechat?: string | null; qq?: string | null; excludeId?: number }) =>
    api.get<DuplicateCustomer[]>('/crm/customers/check-duplicate', clean(params)),
  createCustomer: (body: Record<string, unknown>) => api.post<Customer>('/crm/customers', body),
  updateCustomer: (id: number, body: Record<string, unknown>) => api.put<Customer>(`/crm/customers/${id}`, body),
  deleteCustomer: (id: number) => api.delete(`/crm/customers/${id}`),
  restoreCustomer: (id: number) => api.post(`/crm/customers/${id}/restore`),
  claim: (id: number) => api.post(`/crm/customers/${id}/claim`),
  release: (ids: number[]) => api.post<{ count: number }>('/crm/customers/release', { ids }),
  assign: (ids: number[], ownerId: number) => api.post<{ count: number }>('/crm/customers/assign', { ids, ownerId }),
  addFollowUp: (id: number, body: Record<string, unknown>) => api.post<FollowUp>(`/crm/customers/${id}/follow-ups`, body),
  deleteFollowUp: (id: number) => api.delete(`/crm/follow-ups/${id}`),

  // 渠道
  channels: (includeInactive = false) => api.get<Channel[]>('/crm/channels', clean({ includeInactive: includeInactive ? 1 : undefined })),
  createChannel: (body: Record<string, unknown>) => api.post<Channel>('/crm/channels', body),
  updateChannel: (id: number, body: Record<string, unknown>) => api.put<Channel>(`/crm/channels/${id}`, body),
  disableChannel: (id: number) => api.delete(`/crm/channels/${id}`),

  // 合作机构
  organizations: (params: Record<string, unknown>) => api.get<Paged<Organization>>('/crm/organizations', clean(params)),
  organization: (id: number) => api.get<OrganizationDetail>(`/crm/organizations/${id}`),
  createOrganization: (body: Record<string, unknown>) => api.post<Organization>('/crm/organizations', body),
  updateOrganization: (id: number, body: Record<string, unknown>) => api.put<Organization>(`/crm/organizations/${id}`, body),
  deleteOrganization: (id: number) => api.delete(`/crm/organizations/${id}`),
  restoreOrganization: (id: number) => api.post(`/crm/organizations/${id}/restore`),
  addOrgFollowUp: (id: number, body: Record<string, unknown>) => api.post<OrgFollowUp>(`/crm/organizations/${id}/follow-ups`, body),

  // 日报
  dailyToday: (date?: string) =>
    api.get<{ date: string; report: DailyReport | null; stats: { newCustomers: number; visits: number; followUps: number } }>('/crm/daily/today', clean({ date })),
  dailyMine: (params: Record<string, unknown>) => api.get<Paged<DailyReport>>('/crm/daily/mine', clean(params)),
  saveDaily: (body: Record<string, unknown>) => api.put<DailyReport>('/crm/daily', body),
  dailyAll: (params: Record<string, unknown>) => api.get<Paged<DailyReport> & { unread: number }>('/crm/daily', clean(params)),
  readDaily: (id: number) => api.post(`/crm/daily/${id}/read`),

  // 统计
  overview: (params: Record<string, unknown>) => api.get<Overview>('/crm/stats/overview', clean(params)),
  ranking: (params: Record<string, unknown>) => api.get<Ranking>('/crm/stats/ranking', clean(params)),
}

/** 页面 query → 数字 */
export const qNum = (v: unknown): number | undefined => {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
/** 页面 query → 字符串 */
export const qStr = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v))

/** 金额汇总（多币种）显示 */
export function moneyText(m: Money, fmt: (v: number, c: string) => string): string {
  const parts = Object.entries(m)
    .filter(([, v]) => v)
    .map(([c, v]) => fmt(v, c))
  return parts.length ? parts.join(' + ') : '—'
}

/** ISO → 日期时间选择器的业务时区字符串 "YYYY-MM-DD HH:mm" */
export const toPicker = (iso: string | null | undefined) => (iso ? tz(iso).format('YYYY-MM-DD HH:mm') : null)
/** 选择器字符串（业务时区）→ ISO */
export const fromPicker = (v: string | null | undefined) => {
  if (!v) return null
  const [d, t] = v.split(' ')
  return toApi(d, t || '00:00')
}

/** BarList 条形图数据行 */
export interface BarRow {
  label: string
  value: number
  /** 叠加显示的子值（如签约数） */
  sub?: number
  color?: string
  extra?: string
}
