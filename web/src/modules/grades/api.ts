/** 成绩管理模块前端 API 与类型（后端前缀 /api/grades） */
import { api, type Paged } from '@/api/http'
import type { EduConfig, SubjectDef, TotalMode } from '@/utils/edu'

export interface AssessmentConf {
  subjects: SubjectDef[]
  totalMode: TotalMode
  scoreStep: number
}
export interface IdName { id: number; name: string }

export interface Summary {
  students: number
  entered: number
  absent: number
  fullMark: number
  avg: number | null
  high: number | null
  low: number | null
}

export interface AssessmentRow {
  id: number
  name: string
  kind: string
  examDate: string
  campusId: number
  campus: IdName
  classGroupId: number | null
  classGroup: IdName | null
  createdBy: IdName
  published: boolean
  note: string | null
  deletedAt: string | null
  conf: AssessmentConf
  summary: Summary
}

export interface ScoreRow {
  studentId: number
  student: { id: number; name: string; studentNo: string; deletedAt: string | null }
  scores: Record<string, number>
  total: number | null
  absent: boolean
  comment: string | null
  rank: number | null
}

export interface SubjectStat {
  key: string
  name: string
  max: number
  pass: number
  count: number
  avg: number | null
  high: number | null
  low: number | null
  passRate: number | null
}

export interface AssessmentDetail extends Omit<AssessmentRow, 'summary'> {
  rows: ScoreRow[]
  stats: { summary: Summary; subjects: SubjectStat[]; bands: number[] }
  canManage: boolean
  canEnter: boolean
  canPublish: boolean
}

export interface HistoryRow {
  assessmentId: number
  name: string
  kind: string
  examDate: string
  conf: AssessmentConf
  scores: Record<string, number>
  total: number | null
  absent: boolean
  comment: string | null
  rank: number | null
  ranked: number
  avg: number | null
  fullMark: number
  subjectAvg: Record<string, number | null>
}

export interface PresetSummary {
  id: string
  name: string
  description: string
  examTypes: string[]
  gradeTemplates: string[]
  dicts: Record<string, string[]>
  subjects: Record<string, string[]>
  profileFields: EduConfig['profileFields']
}

export interface AssessmentBody {
  name: string
  kind: string
  examDate: string
  campusId: number | null
  classGroupId: number | null
  conf: AssessmentConf
  published: boolean
  note: string | null
  studentIds?: number[]
}

export const gradesApi = {
  list: (params: Record<string, unknown>) => api.get<Paged<AssessmentRow>>('/grades/assessments', params),
  get: (id: number) => api.get<AssessmentDetail>(`/grades/assessments/${id}`),
  create: (body: AssessmentBody) => api.post<{ id: number }>('/grades/assessments', body),
  update: (id: number, body: AssessmentBody) => api.put(`/grades/assessments/${id}`, body),
  publish: (id: number, published: boolean) => api.post(`/grades/assessments/${id}/publish`, { published }),
  remove: (id: number) => api.delete(`/grades/assessments/${id}`),
  restore: (id: number) => api.post(`/grades/assessments/${id}/restore`),
  addStudents: (id: number, body: { studentIds?: number[]; fromClass?: boolean }) => api.post<{ added: number }>(`/grades/assessments/${id}/students`, body),
  removeStudent: (id: number, studentId: number) => api.delete(`/grades/assessments/${id}/students/${studentId}`),
  saveScores: (id: number, rows: { studentId: number; scores: Record<string, number | null>; total?: number | null; absent: boolean; comment: string | null }[]) =>
    api.put<{ saved: number }>(`/grades/assessments/${id}/scores`, { rows }),
  student: (id: number) => api.get<HistoryRow[]>(`/grades/students/${id}`),
  mine: () => api.get<HistoryRow[]>('/grades/portal/mine'),
  config: () => api.get<{ config: EduConfig; defaults: EduConfig; inUse: string[]; kinds: string[] }>('/grades/config'),
  saveConfig: (conf: EduConfig) => api.put<EduConfig>('/grades/config', conf),
  presets: () => api.get<PresetSummary[]>('/grades/presets'),
  applyPreset: (id: string, parts: string[]) => api.post<{ result: Record<string, number> }>(`/grades/presets/${id}/apply`, { parts }),
  classGroups: () => api.get<{ id: number; name: string; campusId: number; status: string }[]>('/common/class-groups'),
}
