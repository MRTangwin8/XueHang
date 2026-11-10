import { api, type Paged } from '@/api/http'

export type SessionKind = 'CLASS' | 'VIP' | 'OTHER'
export type SessionStatus = 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED'
export type EditScope = 'one' | 'following' | 'all'

export interface Ref { id: number; name: string }

export interface SessionItem {
  id: number
  campusId: number
  kind: SessionKind
  title: string
  roomId: number | null
  teacherId: number | null
  classGroupId: number | null
  vipPackageId: number | null
  seriesId: number | null
  startAt: string
  endAt: string
  hours: number
  status: SessionStatus
  confirmedAt: string | null
  confirmedBy: string | null
  note: string | null
  room: (Ref & { building: string | null; campusId: number }) | null
  teacher: Ref | null
  classGroup: Ref | null
  vipPackage: (Ref & { student: Ref }) | null
  series: { id: number; startDate: string; endDate: string; weekdays: string; startTime: string; endTime: string } | null
  hasRecord: boolean
  canEdit: boolean
}

export interface LessonRecord {
  id: number
  content: string
  homework: string | null
  performance: string | null
  studentVisible: boolean
  teacher: Ref | null
  updatedAt: string
}

export interface SessionDetail extends Omit<SessionItem, 'vipPackage' | 'classGroup'> {
  campus: Ref & { timezone: string }
  classGroup: (Ref & { _count: { students: number } }) | null
  vipPackage: (Ref & { status: string; totalHours: number; usedHours: number; pendingHours: number; remaining: number; student: Ref & { studentNo: string } }) | null
  record: LessonRecord | null
  seriesCount: number
  canCancelConfirmed: boolean
}

export type ConflictReason = 'ROOM' | 'TEACHER' | 'STUDENT'
export interface ConflictInfo {
  sessionId: number
  kind: SessionKind
  title: string
  startAt: string
  endAt: string
  status: SessionStatus
  room: Ref | null
  teacher: Ref | null
  student: Ref | null
  reasons: ConflictReason[]
}

export interface Room {
  id: number
  campusId: number
  campus?: Ref
  name: string
  building: string | null
  capacity: number
  kind: string
  allowVip: boolean
  sort: number
  active: boolean
  note: string | null
}

export interface ClassGroup {
  id: number
  campusId: number
  campus: Ref
  name: string
  subject: string | null
  productId: number | null
  teacherId: number | null
  teacher: Ref | null
  defaultRoomId: number | null
  defaultRoom: Ref | null
  startDate: string | null
  endDate: string | null
  status: 'ACTIVE' | 'FINISHED'
  color: string | null
  note: string | null
  studentCount: number
  sessionCount: number
}
export interface ClassStudent { id: number; name: string; studentNo: string; status: string; phone: string | null; joinedAt: string }
export interface ClassDetail extends Omit<ClassGroup, 'studentCount' | 'sessionCount'> {
  students: ClassStudent[]
  sessionStats: Record<string, number>
  nextSession: { startAt: string; room: { name: string } | null } | null
}

export interface VipPackage {
  id: number
  studentId: number
  student: Ref & { studentNo: string; campusId: number; campus: Ref }
  orderId: number | null
  order: { id: number; orderNo: string } | null
  name: string
  subject: string | null
  totalHours: number
  usedHours: number
  pendingHours: number
  remaining: number
  status: 'ACTIVE' | 'FINISHED'
  expireAt: string | null
  note: string | null
  teachers: Ref[]
  createdAt: string
}
export interface VipListItem extends VipPackage {
  nextSession: { id: number; startAt: string; endAt: string; room: { name: string } | null; teacher: { name: string } | null } | null
  sessionCounts: Record<string, number>
}
export interface VipDetail extends VipPackage { sessions: SessionItem[] }

/** 新建课次对话框的预填值 */
export interface SessionPreset {
  kind?: SessionKind
  campusId?: number | null
  roomId?: number | null
  teacherId?: number | null
  classGroupId?: number | null
  vipPackageId?: number | null
  title?: string
  date?: string
  startTime?: string
  endTime?: string
}

export interface SessionQuery {
  from: string
  to: string
  campusId?: number | null
  roomId?: number | null
  teacherId?: number | null
  kind?: string
  classGroupId?: number | null
  vipPackageId?: number | null
  status?: string
  includeCancelled?: boolean
}

export interface SessionPayload {
  kind: SessionKind
  campusId?: number | null
  title?: string | null
  roomId?: number | null
  teacherId?: number | null
  classGroupId?: number | null
  vipPackageId?: number | null
  hours?: number | null
  note?: string | null
  force?: boolean
}
export interface BatchPayload extends SessionPayload {
  startDate: string
  endDate: string
  weekdays: number[]
  startTime: string
  endTime: string
  skipConflicts?: boolean
}
export interface BatchPreviewItem { date: string; weekday: number; startAt: string; endAt: string; conflicts: ConflictInfo[] }
export interface BatchResult { seriesId: number; created: number; totalHours: number; skipped: { date: string; weekday: number; conflicts: ConflictInfo[] }[] }

export interface UpdatePayload {
  title?: string
  roomId?: number | null
  teacherId?: number | null
  date?: string
  startTime?: string
  endTime?: string
  hours?: number
  note?: string | null
  scope: EditScope
  force?: boolean
}

const silent = { silent: true }
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>

export const scheduleApi = {
  /** 某位学员的课表（与学生端「我的课表」一致） */
  studentTimetable: (id: number, from: string, to: string) => api.get<TimetableItem[]>(`/schedule/students/${id}/timetable`, { from, to }),
  // 课次
  sessions: (q: SessionQuery) => api.get<SessionItem[]>('/schedule/sessions', clean(q)),
  session: (id: number) => api.get<SessionDetail>(`/schedule/sessions/${id}`),
  check: (items: { roomId?: number | null; teacherId?: number | null; vipPackageId?: number | null; startAt: string; endAt: string; excludeId?: number | null }[]) =>
    api.post<ConflictInfo[][]>('/schedule/sessions/check', { items }, silent),
  create: (body: SessionPayload & { startAt: string; endAt: string }) => api.post<SessionItem>('/schedule/sessions', body, silent),
  update: (id: number, body: UpdatePayload) => api.put<{ updated: number; skipped: number; hoursDelta: number }>(`/schedule/sessions/${id}`, body, silent),
  cancel: (id: number, body: { scope: EditScope; reason?: string }) => api.post<{ cancelled: number; skipped: number; releasedHours: number }>(`/schedule/sessions/${id}/cancel`, body),
  confirm: (id: number) => api.post(`/schedule/sessions/${id}/confirm`, {}),
  saveRecord: (id: number, body: { content: string; homework?: string | null; performance?: string | null; studentVisible?: boolean }) => api.put<LessonRecord>(`/schedule/sessions/${id}/record`, body),
  batchPreview: (body: BatchPayload) => api.post<BatchPreviewItem[]>('/schedule/sessions/batch/preview', body),
  batch: (body: BatchPayload) => api.post<BatchResult>('/schedule/sessions/batch', body, silent),

  // 教室
  rooms: (campusId?: number | null, includeInactive = false) => api.get<Room[]>('/schedule/rooms', clean({ campusId, includeInactive: includeInactive || undefined })),
  saveRoom: (body: Partial<Room>, id?: number) => (id ? api.put<Room>(`/schedule/rooms/${id}`, body) : api.post<Room>('/schedule/rooms', body)),
  disableRoom: (id: number) => api.delete(`/schedule/rooms/${id}`),
  restoreRoom: (id: number) => api.post(`/schedule/rooms/${id}/restore`, {}),

  // 班课
  classes: (q: Record<string, unknown>) => api.get<Paged<ClassGroup>>('/schedule/classes', clean(q)),
  classDetail: (id: number) => api.get<ClassDetail>(`/schedule/classes/${id}`),
  saveClass: (body: Record<string, unknown>, id?: number) => (id ? api.put(`/schedule/classes/${id}`, body) : api.post('/schedule/classes', body)),
  deleteClass: (id: number) => api.delete(`/schedule/classes/${id}`),
  addClassStudents: (id: number, studentIds: number[]) => api.post<{ added: number }>(`/schedule/classes/${id}/students`, { studentIds }),
  removeClassStudent: (id: number, studentId: number) => api.delete(`/schedule/classes/${id}/students/${studentId}`),
  finishClass: (id: number) => api.post(`/schedule/classes/${id}/finish`, {}),
  reopenClass: (id: number) => api.post(`/schedule/classes/${id}/reopen`, {}),

  // VIP
  vipList: (q: Record<string, unknown>) => api.get<Paged<VipListItem>>('/schedule/vip', clean(q)),
  vipOptions: (q: { q?: string; campusId?: number | null; ids?: string }) => api.get<VipPackage[]>('/schedule/vip/options', clean(q)),
  vip: (id: number) => api.get<VipDetail>(`/schedule/vip/${id}`),
  saveVip: (body: Record<string, unknown>, id?: number) => (id ? api.put(`/schedule/vip/${id}`, body) : api.post('/schedule/vip', body)),
  finishVip: (id: number) => api.post(`/schedule/vip/${id}/finish`, {}),
  reopenVip: (id: number) => api.post(`/schedule/vip/${id}/reopen`, {}),
  deleteVip: (id: number) => api.delete(`/schedule/vip/${id}`),
}

// ---------------- 学生端 ----------------
export interface PortalSession {
  id: number
  title: string
  startAt: string
  endAt: string
  hours: number
  status: SessionStatus
  confirmedAt: string | null
  confirmedBy: string | null
  room: Ref | null
  teacher: Ref | null
  record: { content: string; homework: string | null; performance: string | null } | null
  canConfirm: boolean
  awaitingRecord?: boolean
  autoConfirmAt: string | null
}
export interface PortalPackage {
  id: number
  name: string
  subject: string | null
  status: 'ACTIVE' | 'FINISHED'
  expireAt: string | null
  totalHours: number
  usedHours: number
  pendingHours: number
  remaining: number
  teachers: Ref[]
  sessions: PortalSession[]
}
/** 学生端「我的课表」中的一节课 */
export interface TimetableItem {
  id: number
  kind: 'CLASS' | 'VIP'
  title: string
  startAt: string
  endAt: string
  status: string
  hours: number
  room: { id: number; name: string; building: string | null } | null
  teacher: Ref | null
  classGroup: Ref | null
  vipPackage: Ref | null
  attendance: string | null
  record: { content: string; homework: string | null; performance: string | null } | null
  canConfirm: boolean
}
export const portalApi = {
  timetable: (from: string, to: string) => api.get<TimetableItem[]>('/schedule/portal/timetable', { from, to }),
  vip: () => api.get<{ autoConfirmEnabled: boolean; autoConfirmHours: number; studentCanConfirm: boolean; packages: PortalPackage[] }>('/schedule/portal/vip'),
  confirm: (id: number) => api.post(`/schedule/portal/sessions/${id}/confirm`, {}),
}
