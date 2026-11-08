import { i18n, t as tr } from '@/i18n'
import { useDict } from '@/stores/dict'
/** 教学服务模块前端 API 与类型（后端前缀 /api/service） */
import { api, type Paged } from '@/api/http'

export interface IdName { id: number; name: string }
export interface StudentLite { id: number; name: string; studentNo: string }

// ---------------- 出勤 ----------------
export interface AttSession {
  id: number
  title: string
  startAt: string
  endAt: string
  status: string
  classGroup: IdName | null
  room: IdName | null
  teacher: IdName | null
  expected: number
  recorded: number
  attended: number
  absent: number
  leave: number
}
export interface SheetRow {
  id: number; name: string; studentNo: string; nameAlt: string | null; status: string | null; note: string | null; recordedAt: string | null }
export interface StudentStat {
  studentId: number; studentNo: string; name: string; classNames: string[]
  total: number; present: number; absent: number; leave: number; late: number; earlyLeave: number; unrecorded: number; attended: number; rate: number | null
}
export interface ClassStat {
  classGroupId: number; name: string; students: number; sessions: number; slots: number; attended: number; absent: number; leave: number; rate: number | null }
export interface AttStats { students: StudentStat[]; byClass: ClassStat[]; summary: {
  classes: number; sessions: number; students: number; slots: number; attended: number; rate: number | null }; formula: string }
export interface ImportResult { added: number; existed: number; matched: { line: string; name: string; studentNo: string }[
  ]; unmatched: { line: string; reason: string }[] }

export const attendanceApi = {
  sessions: (q: object) => api.get<Paged<AttSession>>('/service/attendance/sessions', q),
  sheet: (sessionId: number) =>
    api.get<{ session: AttSession & { room: { name: string } | null; teacher: { name: string } | null }; students: SheetRow[] }>(
      `/service/attendance/sessions/${sessionId}`),
  save: (sessionId: number, records: { studentId: number; status: string; note?: string | null }[]) => api.put(
    `/service/attendance/sessions/${sessionId}`, { records }),
  roster: (classGroupId: number) =>
    api.get<{ classGroup: IdName; items: (StudentLite & {
      nameAlt: string | null; status: string; phone: string | null; joinedAt: string })[] }>(`/service/attendance/classes/${classGroupId}/students`),
  addStudents: (classGroupId: number, body: { studentIds?: number[]; importText?: string }) => api.post<ImportResult>(
    `/service/attendance/classes/${classGroupId}/students`, body),
  removeStudent: (classGroupId: number, studentId: number) => api.delete(`/service/attendance/classes/${classGroupId}/students/${studentId}`),
  stats: (q: object) => api.get<AttStats>('/service/attendance/stats', q),
  products: () => api.get<IdName[]>('/service/attendance/products'),
  classGroups: () => api.get<{ id: number; name: string; campusId: number; teacherId: number | null; status: string }[]>('/common/class-groups'),
}

// ---------------- 面谈 / 面试 ----------------
export type InterviewKind = 'CONSULT' | 'EXAM'
export interface Slot {
  id: number
  kind: InterviewKind
  title: string
  hostId: number
  campusId: number | null
  startAt: string
  endAt: string
  location: string | null
  online: boolean
  studentId: number | null
  bookedAt: string | null
  bookingNote: string | null
  status: string
  host: IdName
  student: StudentLite | null
  campus: IdName | null
  record: { id: number } | null
}
export interface InterviewRecord {
  id: number
  slotId: number | null
  studentId: number
  teacherId: number
  kind: InterviewKind
  heldAt: string
  durationMin: number | null
  japanese: string | null
  english: string | null
  liberalArts: string | null
  math: string | null
  targetSchools: string | null
  guidance: string | null
  content: string | null
  student?: StudentLite
  teacher?: IdName
  slot?: { id: number; title: string; startAt: string } | null
}
export interface BatchResult { preview?: boolean; created?: number; slots: { date: string; start: string; end: string }[]; skipped: {
  date: string; start: string; end: string; reason: string }[] }

export const interviewApi = {
  slots: (q: object) => api.get<Paged<Slot> & { counts: Record<string, number> }>('/service/interviews/slots', q),
  batch: (body: object) => api.post<BatchResult>('/service/interviews/slots/batch', body),
  update: (id: number, body: object) => api.put<Slot>(`/service/interviews/slots/${id}`, body),
  remove: (id: number) => api.delete<{ cancelled?: boolean; deleted?: boolean }>(`/service/interviews/slots/${id}`),
  book: (id: number, studentId: number, note?: string) => api.post<Slot>(`/service/interviews/slots/${id}/book`, { studentId, note }),
  cancelBooking: (id: number) => api.post(`/service/interviews/slots/${id}/cancel-booking`),
  records: (q: object) => api.get<Paged<InterviewRecord>>('/service/interviews/records', q),
  createRecord: (body: object) => api.post<InterviewRecord>('/service/interviews/records', body),
  updateRecord: (id: number, body: object) => api.put<InterviewRecord>(`/service/interviews/records/${id}`, body),
  removeRecord: (id: number) => api.delete(`/service/interviews/records/${id}`),
}

// ---------------- 文书 ----------------
export interface DocRequest {
  id: number
  studentId: number
  title: string
  docType: string | null
  fileUrl: string
  fileName: string
  note: string | null
  submittedAt: string
  editCount: number
  lockAt: string
  dueAt: string
  assignedTeacherId: number | null
  assignedAt: string | null
  status: string
  returnFileUrl: string | null
  returnFileName: string | null
  returnNote: string | null
  returnedAt: string | null
  deletedAt: string | null
  student?: StudentLite
  assignedTeacher?: IdName | null
  overdue?: boolean
  canEdit?: boolean
  reason?: string | null
}
export const documentApi = {
  list: (q: object) => api.get<Paged<DocRequest> & { counts: { mine: number; unassigned: number; trash: number } }>('/service/documents', q),
  assign: (id: number, teacherId: number) => api.post(`/service/documents/${id}/assign`, { teacherId }),
  giveBack: (id: number, body: object) => api.post(`/service/documents/${id}/return`, body),
  remove: (id: number) => api.delete(`/service/documents/${id}`),
  restore: (id: number) => api.post(`/service/documents/${id}/restore`),
}

// ---------------- 打印 ----------------
export interface PrintReq {
  id: number
  studentId: number
  fileUrl: string
  fileName: string
  colorMode: 'BW' | 'COLOR'
  pages: number
  copies: number
  fee: number
  note: string | null
  status: string
  readyAt: string
  submittedAt: string
  handledAt: string | null
  student?: StudentLite
}
export const printApi = {
  list: (q: object) => api.get<Paged<PrintReq> & { totalFee: number; totalSheets: number; counts: Record<string, number> }>('/service/prints', q),
  setStatus: (id: number, status: string) => api.post<PrintReq>(`/service/prints/${id}/status`, { status }),
}

// ---------------- 通知 / 资料 ----------------
export interface Notice {
  id: number
  campusId: number | null
  title: string
  content: string
  audience: string
  pinned: boolean
  publishedAt: string
  author?: IdName | null
  campus?: IdName | null
}
export interface SharedFile {
  id: number
  campusId: number | null
  title: string
  description: string | null
  fileUrl: string
  fileName: string
  fileSize: number | null
  audience: string
  createdAt: string
  uploadedBy?: IdName | null
  campus?: IdName | null
}
export const noticeApi = {
  list: (q: object) => api.get<Paged<Notice>>('/service/notices', q),
  get: (id: number) => api.get<Notice>(`/service/notices/${id}`),
  create: (body: object) => api.post<Notice>('/service/notices', body),
  update: (id: number, body: object) => api.put<Notice>(`/service/notices/${id}`, body),
  remove: (id: number) => api.delete(`/service/notices/${id}`),
}
export const fileApi = {
  list: (q: object) => api.get<Paged<SharedFile>>('/service/files', q),
  create: (body: object) => api.post<SharedFile>('/service/files', body),
  update: (id: number, body: object) => api.put<SharedFile>(`/service/files/${id}`, body),
  remove: (id: number) => api.delete(`/service/files/${id}`),
}

// ---------------- 工资 ----------------
export interface WageClaim {
  id: number
  userId: number
  workDate: string
  startAt: string | null
  endAt: string | null
  category: string
  hours: number
  hourlyRate: number
  amount: number
  transportFee: number
  fromStation: string | null
  toStation: string | null
  content: string
  sessionId: number | null
  status: string
  reviewedAt: string | null
  reviewNote: string | null
  user?: { id: number; name: string; staffNo: string }
  reviewer?: IdName | null
  session?: { id: number; title: string; startAt: string; endAt: string } | null
}
export interface WageTotals { count: number; hours: number; amount: number; transport: number; total: number }
export interface MySession { id: number; kind: string; title: string; startAt: string; endAt: string; duration: number; room: { name: string } | null }
export interface WageSummaryRow extends WageTotals {
  userId: number; name: string; staffNo: string; bank: string; approved: WageTotals; pending: WageTotals; rejected: WageTotals }

export const wageApi = {
  mine: (month: string) =>
    api.get<{ month: string; items: WageClaim[]; summary: WageTotals; approved: WageTotals; pending: WageTotals; defaults: {
      hourlyRate: number | null; transportFee: number | null } }>('/service/wage/mine', { month }),
  mySessions: (month: string) => api.get<MySession[]>('/service/wage/my-sessions', { month }),
  create: (body: object) => api.post<WageClaim>('/service/wage', body),
  fromSessions: (body: object) => api.post<{ created: number }>('/service/wage/from-sessions', body),
  update: (id: number, body: object) => api.put<WageClaim>(`/service/wage/${id}`, body),
  remove: (id: number) => api.delete(`/service/wage/${id}`),
  list: (q: object) => api.get<Paged<WageClaim> & { summary: WageTotals; counts: Record<string, number> }>('/service/wage', q),
  review: (ids: number[], status: 'APPROVED' | 'REJECTED', reviewNote?: string) => api.post<{ updated: number }>(
    '/service/wage/review', { ids, status, reviewNote }),
  summary: (q: object) => api.get<{ month: string; items: WageSummaryRow[] }>('/service/wage/summary', q),
}

// ---------------- 薪资审核范围 ----------------
export type ReviewMode = 'ALL' | 'CAMPUS' | 'CUSTOM'
export interface ReviewScope {
  configured: boolean
  mode: ReviewMode | null
  campuses: IdName[]
  users: { id: number; name: string; staffNo: string }[]
  updatedAt: string | null
}
export interface Reviewer extends ReviewScope {
  id: number
  name: string
  staffNo: string
  campus: IdName | null
  roleNames: string[]
  isSuper: boolean
  /** 未单独配置时按角色数据范围得到的默认范围 */
  defaultMode: 'ALL' | 'CAMPUS'
}
export const wageScopeApi = {
  mine: () => api.get<ReviewScope & { effective: ReviewMode; canReviewOwn: boolean }>('/service/wage/review-scope/me'),
  list: () => api.get<Reviewer[]>('/service/wage/review-scopes'),
  save: (id: number, body: { mode: ReviewMode; campusIds: number[]; userIds: number[] }) => api.put<ReviewScope>(`/service/wage/review-scopes/${id}`, body),
  reset: (id: number) => api.delete(`/service/wage/review-scopes/${id}`),
}

// ---------------- 首页看板 ----------------
export interface DashTodo { key: string; label: string; count: number; link: string; tone: string; icon: string }
export interface Dashboard {
  notices: { id: number; title: string; pinned: boolean; publishedAt: string; audience: string; author: { name: string } | null }[]
  files: { id: number; title: string; fileName: string; fileUrl: string; fileSize: number | null; createdAt: string }[]
  todos: DashTodo[]
  todaySessions: {
     id: number; kind: string; title: string; startAt: string; endAt: string; status: string; classGroupId: number | null; room: {
    name: string } | null; studentCount: number; studentName: string | null; attendanceRecorded: number }[]
  todayInterviews: {
    id: number
    kind: string
    title: string
    startAt: string
    endAt: string
    status: string
    location: string | null
    online: boolean
    student: StudentLite | null
  }[]
}
export const dashboardApi = { get: () => api.get<Dashboard>('/service/dashboard') }

// ---------------- 学生端 ----------------
export interface PortalSlot {
  id: number
  kind: InterviewKind
  title: string
  startAt: string
  endAt: string
  location: string | null
  online: boolean
  status: string
  host: IdName
  campus: IdName | null
  bookingNote?: string | null
}
export interface PortalBooking extends PortalSlot { canCancel: boolean; cancelLockAt: string }
export interface PortalRecord {
  id: number
  kind: InterviewKind
  heldAt: string
  durationMin: number | null
  japanese: string | null
  english: string | null
  liberalArts: string | null
  math: string | null
  targetSchools: string | null
  guidance: string | null
  teacher: { name: string }
}
export interface PrintQuote { pages: number; detected: boolean; unitPrice: number; fee: number; readyAt: string }

export const portalApi = {
  home: () =>
    api.get<{
      notices: { id: number; title: string; pinned: boolean; publishedAt: string }[]
      bookings: PortalSlot[]
      documents: Pick<DocRequest, 'id' | 'title' | 'status' | 'submittedAt' | 'dueAt' | 'lockAt' | 'editCount' | 'returnedAt'>[]
      prints: Pick<PrintReq, 'id' | 'fileName' | 'status' | 'fee' | 'readyAt' | 'submittedAt' | 'pages' | 'copies' | 'colorMode'>[]
      unread: number
    }>('/service/portal/home'),
  slots: (kind: InterviewKind) => api.get<{ kind: InterviewKind; days: { date: string; weekday: number; items: PortalSlot[] }[] }>(
    '/service/portal/interview-slots', { kind }),
  book: (id: number, note?: string) => api.post<PortalSlot>(`/service/portal/interview-slots/${id}/book`, { note }),
  cancel: (id: number) => api.post(`/service/portal/interview-slots/${id}/cancel`),
  interviews: () => api.get<{ bookings: PortalBooking[]; records: PortalRecord[] }>('/service/portal/interviews'),
  documents: () => api.get<DocRequest[]>('/service/portal/documents'),
  submitDocument: (body: object) => api.post<DocRequest>('/service/portal/documents', body),
  editDocument: (id: number, body: object) => api.put<DocRequest>(`/service/portal/documents/${id}`, body),
  prints: () => api.get<PrintReq[]>('/service/portal/prints'),
  quotePrint: (body: object) => api.post<PrintQuote>('/service/portal/prints/quote', body, { silent: true }),
  submitPrint: (body: object) => api.post<PrintReq & { detected: boolean }>('/service/portal/prints', body),
  cancelPrint: (id: number) => api.post(`/service/portal/prints/${id}/cancel`),
  notices: (q: object) => api.get<Paged<Pick<Notice, 'id' | 'title' | 'pinned' | 'publishedAt' | 'audience'>>>('/service/portal/notices', q),
  notice: (id: number) => api.get<Notice>(`/service/portal/notices/${id}`),
  files: (q: object) => api.get<Paged<SharedFile>>('/service/portal/files', q),
}

// ---------------- 工具 ----------------
/** 旧数据可能是 HTML：转为纯文字（只取文字，不保留任何标签） */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>?/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * 公告正文渲染（供 v-html 使用，输出保证安全）：
 * 1. 一律当作纯文本处理（旧 HTML 先转为文字）；2. 全部转义；3. 仅把 http(s) 链接变为可点击；4. 换行转 <br>。
 * 因为先转义后排版，任何标签、事件属性、javascript: 链接都不可能被执行。
 */
export function renderContent(text: string | null | undefined): string {
  if (!text) return ''
  const plain = /<\/?[a-z!][\s\S]*?>/i.test(text) ? htmlToText(text) : text
  return escapeHtml(plain)
    .replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
    .replace(/\r?\n/g, '<br>')
}

/** 文件大小 */
export function fileSize(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 文书规则说明（客户原文，勿改） */
export const documentRulesTitle = () => tr('service.text.documentRevisionRequestRules')
const lines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const ruleValues = () => {
  const rules = useDict().rules
  const zh = i18n.global.locale.value === 'zh-CN'
  return {
    hours: rules?.documentEditHours ?? 24,
    times: zh && (rules?.documentMaxEdits ?? 1) === 1 ? '\u4e00' : rules?.documentMaxEdits ?? 1,
    days: zh ? ((rules?.documentReturnDays ?? 7) === 7 ? '\u4e00\u5468' : `${rules?.documentReturnDays ?? 7}\u65e5`) : rules?.documentReturnDays ?? 7,
    bw: rules?.printPriceBW ?? 10,
    color: rules?.printPriceColor ?? 50,
    cutoff: rules?.printCutoff ?? '12:00',
    ready: rules?.printReadyTime ?? '17:00',
  }
}
export const documentRules = () => {
  const rules = useDict().rules
  if (rules?.documentRulesText.trim()) return lines(rules.documentRulesText)
  const values = ruleValues()
  return [
    tr('service.text.rule1YouMayMakeOneChangeWithin24Hours', values),
    tr('service.text.rule2After24HoursTheRequestIsAutomaticallyLocked', values),
  tr('service.text.rule3ForFurtherChangesSubmitANewRevisionRequest'),
    tr('service.text.rule4RevisedDocumentsWillBeReturnedWithinOneWeek', values),
  tr('service.text.rule5AllowEnoughTimeForSubmissionAndRevisionTo'),
  tr('service.text.youAreResponsibleForAnyMissedApplicationDeadlineCaused'),
  ]
}

/** 资料打印说明（客户原文，勿改） */
export const printGuide = () => {
  const rules = useDict().rules
  if (rules?.printGuideText.trim()) return lines(rules.printGuideText).map((text) => ({ label: '', text }))
  const values = ruleValues()
  return [
  { label: tr('service.text.uploadFiles'), text: tr('service.text.uploadFilesDirectlyToTheSystemInPdfOr2') },
  { label: tr('service.text.printingFees'), text: tr('service.text.singleSidedBlackAndWhite10PerSheetSingle', values) },
  { label: tr('service.text.collectionTime'), text: tr('service.text.requestsSubmittedBefore1200CanBeCollectedAfter', values) },
  ]
}
