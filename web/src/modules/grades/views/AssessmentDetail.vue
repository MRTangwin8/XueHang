<script setup lang="ts">
/** 考试详情：成绩录入（表格 / 从 Excel 粘贴）、统计分析、导出 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import StudentSelect from '@/components/StudentSelect.vue'
import { useDict } from '@/stores/dict'
import { downloadFile, useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import { computeTotal, passLine } from '@/utils/edu'
import AssessmentDialog from '../components/AssessmentDialog.vue'
import { gradesApi, type AssessmentDetail, type AssessmentRow } from '../api'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const dict = useDict()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('560px')
const id = computed(() => Number(route.params.id))

interface EditRow {
  studentId: number
  studentNo: string
  name: string
  scores: Record<string, number | null>
  total: number | null
  absent: boolean
  comment: string
  rank: number | null
  dirty: boolean
}

const a = ref<AssessmentDetail | null>(null)
const rows = ref<EditRow[]>([])
const loading = ref(false)
const saving = ref(false)
const tab = ref('entry')

async function load() {
  loading.value = true
  try {
    const d = await gradesApi.get(id.value)
    a.value = d
    rows.value = d.rows.map((r) => ({
      studentId: r.studentId,
      studentNo: r.student.studentNo,
      name: r.student.name,
      scores: Object.fromEntries(d.conf.subjects.map((s) => [s.key, r.scores[s.key] ?? null])),
      total: r.total,
      absent: r.absent,
      comment: r.comment ?? '',
      rank: r.rank,
      dirty: false,
    }))
  } finally {
    loading.value = false
  }
}
watch(id, () => { dict.load(); load() }, { immediate: true })

const conf = computed(() => a.value?.conf ?? { subjects: [], totalMode: 'sum' as const, scoreStep: 1 })
const manual = computed(() => conf.value.totalMode === 'manual')
const rowTotal = (r: EditRow) => (r.absent ? null : manual.value ? r.total : computeTotal(conf.value.subjects, r.scores, conf.value.totalMode, conf.value.scoreStep))
const dirtyCount = computed(() => rows.value.filter((r) => r.dirty).length)
const touch = (r: EditRow) => (r.dirty = true)
const low = (key: string, v: number | null | undefined) => {
  const s = conf.value.subjects.find((x) => x.key === key)
  return s != null && v != null && v < passLine(s)
}

async function save() {
  if (!a.value) return
  const changed = rows.value.filter((r) => r.dirty)
  if (!changed.length) return ElMessage.info(t('grades.detail.nothingToSave'))
  saving.value = true
  try {
    await gradesApi.saveScores(a.value.id, changed.map((r) => ({ studentId: r.studentId, scores: r.absent ? {} : r.scores, total: manual.value ? r.total : null,
      absent: r.absent, comment: r.comment || null })))
    ElMessage.success(t('grades.detail.savedN', { p1: changed.length }))
    await load()
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(async () => {
  if (!dirtyCount.value) return true
  return ElMessageBox.confirm(t('grades.detail.leaveConfirm'), t('common.confirmTitle'), { type: 'warning' }).then(() => true).catch(() => false)
})

// ---------- 名单 ----------
const addDlg = ref(false)
const addIds = ref<number[]>([])
async function addStudents(fromClass = false) {
  if (!a.value) return
  const r = await gradesApi.addStudents(a.value.id, fromClass ? { fromClass: true } : { studentIds: addIds.value })
  ElMessage.success(t('grades.detail.addedN', { p1: r.added }))
  addDlg.value = false
  addIds.value = []
  load()
}
async function removeStudent(r: EditRow) {
  if (!a.value) return
  await ElMessageBox.confirm(t('grades.detail.removeConfirm', { p1: r.name }), t('common.confirmTitle'), { type: 'warning' })
  await gradesApi.removeStudent(a.value.id, r.studentId)
  load()
}

// ---------- 从 Excel 粘贴 ----------
const pasteDlg = ref(false)
const pasteText = ref('')
const pasteErrors = ref<string[]>([])
const pasteHint = computed(() => [t('auth.studentNo'), ...conf.value.subjects.map((s) => s.name)].join(' ⇥ '))
function applyPaste() {
  const errs: string[] = []
  let n = 0
  const absentWords = ['缺考', '缺', 'absent', 'abs', '欠席'] // i18n-ignore 粘贴时可识别的「缺考」写法
  for (const [i, line] of pasteText.value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const cells = line.split(/\t|,/).map((c) => c.trim())
    const row = rows.value.find((r) => r.studentNo === cells[0] || r.name === cells[0])
    if (!row) {
      if (i > 0 || /\d/.test(cells[0])) errs.push(t('grades.detail.pasteUnknown', { p1: i + 1, p2: cells[0] }))
      continue
    }
    const vals = cells.slice(1)
    if (vals.some((v) => absentWords.includes(v.toLowerCase()))) {
      row.absent = true
    } else {
      row.absent = false
      conf.value.subjects.forEach((s, k) => {
        const v = vals[k]
        if (v === undefined || v === '') return
        const num = Number(v)
        if (!Number.isFinite(num) || num < 0 || num > s.max) errs.push(t('grades.detail.pasteBad', { p1: i + 1, p2: s.name, p3: v }))
        else row.scores[s.key] = num
      })
      if (manual.value && vals[conf.value.subjects.length] !== undefined && vals[conf.value.subjects.length] !== '')
        row.total = Number(vals[conf.value.subjects.length])
    }
    row.dirty = true
    n++
  }
  pasteErrors.value = errs
  if (n) ElMessage.success(t('grades.detail.pasteApplied', { p1: n }))
  if (!errs.length) pasteDlg.value = false
}

// ---------- 其他操作 ----------
const editDlg = ref(false)
const asRow = computed(() => a.value as unknown as AssessmentRow)
async function togglePublish() {
  if (!a.value) return
  await gradesApi.publish(a.value.id, !a.value.published)
  ElMessage.success(a.value.published ? t('grades.list.unpublished') : t('grades.list.publishedMsg'))
  load()
}
function exportXlsx() {
  if (!a.value) return
  downloadFile(`/api/grades/assessments/${a.value.id}/export`, `${a.value.name}.xlsx`).catch((e) => ElMessage.error(String(e)))
}

// ---------- 统计 ----------
const stats = computed(() => a.value?.stats)
const bandLabels = ['<60%', '60–70%', '70–80%', '80–90%', '≥90%']
const bandMax = computed(() => Math.max(1, ...(stats.value?.bands ?? [])))
const ranking = computed(() => [...(a.value?.rows ?? [])].filter((r) => r.rank != null).sort((x, y) => x.rank! - y.rank!))
const pctOf = (v: number | null, max: number) => (v == null || !max ? 0 : Math.min(100, Math.round((v / max) * 100)))
</script>

<template>
  <div v-loading="loading" class="page">
    <template v-if="a">
      <div class="page-card head">
        <div class="head-main">
          <div class="title">
            <el-button link icon="ArrowLeft" @click="router.push('/students/grades')" />
            <b>{{ a.name }}</b>
            <el-tag v-if="a.published" type="success" disable-transitions>{{ t('grades.list.published') }}</el-tag>
            <el-tag v-else type="info" disable-transitions>{{ t('grades.list.draft') }}</el-tag>
          </div>
          <div class="muted meta">
            <span>{{ fmtDate(a.examDate) }}</span>
            <span>{{ dict.label('assessmentKinds', a.kind) }}</span>
            <span>{{ a.campus.name }}</span>
            <span v-if="a.classGroup">{{ a.classGroup.name }}</span>
            <span>{{ t('grades.dialog.fullMark', { p1: stats?.summary.fullMark }) }}</span>
          </div>
        </div>
        <div class="head-actions">
          <el-button icon="Download" @click="exportXlsx">{{ t('common.export') }}</el-button>
          <template v-if="a.canManage">
            <el-button icon="Edit" @click="editDlg = true">{{ t('common.edit') }}</el-button>
            <el-button :type="a.published ? 'default' : 'success'" icon="Promotion" @click="togglePublish">
              {{ a.published ? t('grades.list.unpublish') : t('grades.list.publish') }}
            </el-button>
          </template>
        </div>
      </div>

      <div class="page-card">
        <el-tabs v-model="tab">
          <!-- 录入 -->
          <el-tab-pane :label="a.canManage ? t('grades.detail.entry') : t('grades.detail.scores')" name="entry">
            <div v-if="a.canManage" class="toolbar">
              <el-button icon="Plus" @click="addDlg = true">{{ t('grades.detail.addStudents') }}</el-button>
              <el-button v-if="a.classGroupId" icon="Refresh" @click="addStudents(true)">{{ t('grades.detail.syncClass') }}</el-button>
              <el-button icon="DocumentCopy" @click="pasteDlg = true">{{ t('grades.detail.paste') }}</el-button>
              <span class="spacer" />
              <span v-if="dirtyCount" class="dirty">{{ t('grades.detail.unsaved', { p1: dirtyCount }) }}</span>
              <el-button type="primary" icon="Check" :loading="saving" :disabled="!dirtyCount" @click="save">{{ t('common.save') }}</el-button>
            </div>
            <el-table :data="rows" size="small" max-height="calc(100vh - 330px)" class="entry-table" row-key="studentId">
              <el-table-column :label="t('grades.detail.rank')" width="60" align="center" fixed>
                <template #default="{ row }: any">
                  <span v-if="row.rank" :class="['rank', row.rank <= 3 && 'top']">{{ row.rank }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('profile.name')" :width="isMobile ? 90 : 150" fixed>
                <template #default="{ row }: any">
                  <div class="nm">{{ row.name }}</div>
                  <div class="muted small">{{ row.studentNo }}</div>
                </template>
              </el-table-column>
              <el-table-column v-for="s in conf.subjects" :key="s.key" :label="`${s.name} (${s.max})`" min-width="96" align="center">
                <template #default="{ row }: any">
                  <el-input-number
                    v-if="a.canManage"
                    v-model="row.scores[s.key]"
                    :min="0"
                    :max="s.max"
                    :step="conf.scoreStep"
                    :controls="false"
                    :disabled="row.absent"
                    size="small"
                    :class="['score-in', low(s.key, row.scores[s.key]) && 'low']"
                    @change="touch(row)"
                  />
                  <span v-else :class="low(s.key, row.scores[s.key]) && 'low-text'">{{ row.absent ? '' : (row.scores[s.key] ?? '') }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.total')" width="90" align="center">
                <template #default="{ row }: any">
                  <el-input-number v-if="manual && a.canManage" v-model="row.total" :min="0" :controls="false" size="small" :disabled="row.absent"
                    class="score-in" @change="touch(row)" />
                  <b v-else class="total">{{ rowTotal(row) ?? '—' }}</b>
                </template>
              </el-table-column>
              <el-table-column :label="t('grades.detail.absent')" width="64" align="center">
                <template #default="{ row }: any">
                  <el-checkbox v-model="row.absent" :disabled="!a.canManage" @change="touch(row)" />
                </template>
              </el-table-column>
              <el-table-column :label="t('grades.detail.comment')" min-width="180">
                <template #default="{ row }: any">
                  <el-input v-if="a.canManage" v-model="row.comment" size="small" maxlength="500" @input="touch(row)" />
                  <span v-else>{{ row.comment }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="a.canManage" width="44" fixed="right">
                <template #default="{ row }: any">
                  <el-button link type="danger" icon="Close" @click="removeStudent(row)" />
                </template>
              </el-table-column>
              <template #empty><el-empty :description="t('grades.detail.noStudents')" :image-size="60" /></template>
            </el-table>
          </el-tab-pane>

          <!-- 统计 -->
          <el-tab-pane v-if="stats" :label="t('grades.detail.analysis')" name="stats">
            <div class="stat-grid">
              <div class="stat"><div class="stat-label">{{ t('grades.stats.students') }}</div><div class="stat-value">{{ stats.summary.students }}</div></div>
              <div class="stat"><div class="stat-label">{{ t('grades.stats.entered') }}</div><div class="stat-value">{{ stats.summary.entered }}</div></div>
              <div class="stat"><div class="stat-label">{{ t('grades.detail.absent') }}</div><div class="stat-value">{{ stats.summary.absent }}</div></div>
              <div class="stat"><div class="stat-label">{{ t('grades.stats.avg') }}</div><div class="stat-value">{{ stats.summary.avg ?? '—' }}</div></div>
              <div class="stat"><div class="stat-label">{{ t('grades.stats.high') }}</div><div class="stat-value">{{ stats.summary.high ?? '—' }}</div></div>
              <div class="stat"><div class="stat-label">{{ t('grades.stats.low') }}</div><div class="stat-value">{{ stats.summary.low ?? '—' }}</div></div>
            </div>
            <div class="two-col">
              <div>
                <h3 class="page-title">{{ t('grades.stats.bySubject') }}</h3>
                <el-table :data="stats.subjects" size="small">
                  <el-table-column :label="t('grades.subject.name')" min-width="100">
                    <template #default="{ row }: any">{{ row.name }} <span class="muted">/ {{ row.max }}</span></template>
                  </el-table-column>
                  <el-table-column :label="t('grades.stats.avg')" min-width="140">
                    <template #default="{ row }: any">
                      <div class="bar-cell">
                        <div class="bar"><i :style="{ width: pctOf(row.avg, row.max) + '%' }" /></div>
                        <b>{{ row.avg ?? '—' }}</b>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('grades.stats.high')" width="70" align="center" prop="high" />
                  <el-table-column :label="t('grades.stats.low')" width="70" align="center" prop="low" />
                  <el-table-column :label="t('grades.stats.passRate')" width="90" align="center">
                    <template #default="{ row }: any">{{ row.passRate == null ? '—' : row.passRate + '%' }}</template>
                  </el-table-column>
                </el-table>
                <h3 class="page-title sec">{{ t('grades.stats.distribution') }}</h3>
                <div class="dist">
                  <div v-for="(n, i) in stats.bands" :key="i" class="dist-col">
                    <div class="dist-n">{{ n }}</div>
                    <div class="dist-bar" :style="{ height: Math.round((n / bandMax) * 100) + '%' }" :class="'b' + i" />
                    <div class="dist-l">{{ bandLabels[i] }}</div>
                  </div>
                </div>
              </div>
              <div>
                <h3 class="page-title">{{ t('grades.stats.ranking') }}</h3>
                <ol class="rank-list">
                  <li v-for="r in ranking" :key="r.studentId">
                    <span :class="['rank', r.rank! <= 3 && 'top']">{{ r.rank }}</span>
                    <span class="nm">{{ r.student.name }}</span>
                    <span class="spacer" />
                    <b>{{ r.total }}</b>
                  </li>
                </ol>
                <el-empty v-if="!ranking.length" :image-size="60" :description="t('grades.detail.noScores')" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <el-dialog v-model="addDlg" :title="t('grades.detail.addStudents')" :width="dlgWidth">
        <StudentSelect v-model="addIds" multiple status="ENROLLED" style="width: 100%" />
        <template #footer>
          <el-button @click="addDlg = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :disabled="!addIds.length" @click="addStudents(false)">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="pasteDlg" :title="t('grades.detail.paste')" :width="dlgWidth">
        <p class="muted">{{ t('grades.detail.pasteHelp') }}</p>
        <p class="hint"><code>{{ pasteHint }}</code></p>
        <el-input v-model="pasteText" type="textarea" :rows="10" :placeholder="t('grades.detail.pastePh')" />
        <el-alert v-for="(e, i) in pasteErrors" :key="i" type="warning" :title="e" :closable="false" style="margin-top: 6px" />
        <template #footer>
          <el-button @click="pasteDlg = false">{{ t('common.close') }}</el-button>
          <el-button type="primary" :disabled="!pasteText.trim()" @click="applyPaste">{{ t('grades.detail.pasteApply') }}</el-button>
        </template>
      </el-dialog>

      <AssessmentDialog v-model="editDlg" :edit="asRow" @saved="load" />
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.head-main { flex: 1; min-width: 240px; }
.title { display: flex; align-items: center; gap: 8px; font-size: 18px; }
.meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dirty { color: var(--el-color-warning); font-size: 13px; }
.entry-table :deep(.score-in) { width: 100%; }
.entry-table :deep(.score-in.low .el-input__inner), .low-text { color: var(--el-color-danger); font-weight: 600; }
.nm { font-weight: 600; }
.small { font-size: 12px; }
.total { color: var(--xh-primary); }
.rank { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 50%; background: #f1f5f9; font-size: 12px; font-weight: 600; }
.rank.top { background: var(--xh-primary); color: #fff; }
.two-col { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 24px; margin-top: 12px; }
.bar-cell { display: flex; align-items: center; gap: 8px; }
.bar { flex: 1; height: 8px; border-radius: 4px; background: #eef0f5; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--xh-primary); border-radius: 4px; }
.dist { display: flex; align-items: flex-end; gap: 14px; height: 170px; padding: 8px 4px 0; }
.dist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
.dist-bar { width: 100%; max-width: 56px; min-height: 2px; border-radius: 6px 6px 0 0; background: var(--xh-primary); }
.dist-bar.b0 { background: #f87171; }
.dist-bar.b1 { background: #fbbf24; }
.dist-bar.b2 { background: #a3a3f5; }
.dist-bar.b3 { background: #6366f1; }
.dist-bar.b4 { background: var(--xh-teal); }
.dist-n { font-weight: 600; font-size: 13px; }
.dist-l { font-size: 12px; color: var(--xh-text-2); }
.rank-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.rank-list li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; background: #fafbff; }
.rank-list .spacer { flex: 1; }
.hint code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
@media (max-width: 900px) {
  .two-col { grid-template-columns: 1fr; }
}
</style>
