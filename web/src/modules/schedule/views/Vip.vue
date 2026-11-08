<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** VIP 班级管理：课时包列表（未结业优先）、课时账本、课次明细、约课 / 批量约课 / 确认 / 取消 / 删除已确认 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import DictTag from '@/components/DictTag.vue'
import StudentSelect from '@/components/StudentSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDate, fmtMonthDay } from '@/utils/time'
import { scheduleApi, type SessionPreset, type VipDetail, type VipListItem } from '../api'
import { timeRange } from '../utils'
import HoursBar from '../components/HoursBar.vue'
import SessionDialog from '../components/SessionDialog.vue'
import BatchDialog from '../components/BatchDialog.vue'
import SessionDrawer from '../components/SessionDrawer.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMobile = useIsMobile()
const canManage = computed(() => auth.can('vip.manage'))
const canBook = computed(() => auth.can(['schedule.edit', 'schedule.own']))
const dlgWidth = useDialogWidth('560px')

const q = reactive({
  q: (route.query.q as string) || '',
  status: (route.query.status as string) || '',
  teacherId: route.query.teacherId ? Number(route.query.teacherId) : null,
  campusId: route.query.campusId ? Number(route.query.campusId) : null,
  page: Number(route.query.page) || 1,
  pageSize: 20,
})
const items = ref<VipListItem[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await scheduleApi.vipList({ ...q })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function search() {
  q.page = 1
  reload()
}
function reload() {
  router.replace({ query: Object.fromEntries(Object.entries({ ...q, pageSize: undefined, page: q.page > 1 ? q.page : undefined }).filter(([, v]) =>
    v !== null && v !== '' && v !== undefined)) as Record<string, string> })
  load()
}
watch(() => [q.status, q.teacherId, q.campusId], search)
onMounted(load)

// ---------------- 新建 / 编辑 ----------------
const editVisible = ref(false)
const editId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({ studentId: null as number | null, name: '', subject: '', totalHours: 10, teacherIds: [] as number[],
  expireAt: null as string | null, note: '' })
function openEdit(p?: VipListItem | VipDetail) {
  editId.value = p?.id ?? null
  Object.assign(form, p
    ? { studentId: p.studentId, name: p.name, subject: p.subject ?? '', totalHours: p.totalHours, teacherIds: p.teachers.map((t) => t.id),
      expireAt: p.expireAt ? fmtDate(p.expireAt) : null, note: p.note ?? '' }
    : { studentId: null, name: '', subject: '', totalHours: 10, teacherIds: [], expireAt: null, note: '' })
  editVisible.value = true
}
const minTotal = computed(() => {
  const p = items.value.find((i) => i.id === editId.value) ?? (detail.value?.id === editId.value ? detail.value : null)
  return p ? Math.round((p.usedHours + p.pendingHours) * 100) / 100 : 0
})
async function save() {
  if (!form.studentId) return ElMessage.warning(t('schedule.pleaseSelectAStudent'))
  if (!form.name.trim()) return ElMessage.warning(t('schedule.pleaseEnterThePackageName'))
  if (!form.teacherIds.length) return ElMessage.warning(t('schedule.pleaseSelectAtLeastOneTeacher'))
  if (form.totalHours < minTotal.value) return ElMessage.warning(t('schedule.totalHoursCannotBeLessThanConfirmed', { p0: minTotal.value }))
  saving.value = true
  try {
    await scheduleApi.saveVip({ ...form, name: form.name.trim(), expireAt: form.expireAt || null }, editId.value ?? undefined)
    ElMessage.success(t('common.saved'))
    editVisible.value = false
    load()
    if (detail.value && detail.value.id === editId.value) openDetail(detail.value.id)
  } finally {
    saving.value = false
  }
}

async function toggleFinish(p: { id: number; status: string; name: string }) {
  const finish = p.status === 'ACTIVE'
  try {
    await ElMessageBox.confirm(finish ? t('schedule.markAsCompletedFurtherBookingsWillBe', { p0: p.name }) : t('schedule.restoreToEnrolled',
      { p0: p.name }), finish ? t('schedule.completed') : t('schedule.restoreEnrollment'), { type: 'warning' })
  } catch {
    return
  }
  await (finish ? scheduleApi.finishVip(p.id) : scheduleApi.reopenVip(p.id))
  ElMessage.success(t('schedule.updated'))
  load()
  if (detail.value?.id === p.id) openDetail(p.id)
}
async function remove(p: VipListItem) {
  try {
    await ElMessageBox.confirm(t('schedule.deleteLessonPackageCancelAllSessionsFirst', { p0: p.name }), t('common.delete'), { type: 'warning' })
  } catch {
    return
  }
  await scheduleApi.deleteVip(p.id)
  ElMessage.success(t('common.deleted'))
  load()
}

// ---------------- 详情 ----------------
const detailVisible = ref(false)
const detail = ref<VipDetail | null>(null)
const detailLoading = ref(false)
const showCancelled = ref(false)
async function openDetail(id: number) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await scheduleApi.vip(id)
  } finally {
    detailLoading.value = false
  }
}
const detailSessions = computed(() => (detail.value?.sessions ?? []).filter((s) => showCancelled.value || s.status !== 'CANCELLED'))
const refreshAll = () => {
  load()
  if (detail.value) openDetail(detail.value.id)
}

async function confirmSession(id: number) {
  try {
    await ElMessageBox.confirm(t('schedule.confirmThisSessionHasBeenCompletedIts'), t('schedule.confirmSession'), { type: 'info' })
  } catch {
    return
  }
  await scheduleApi.confirm(id)
  ElMessage.success(t('schedule.confirmed'))
  refreshAll()
}

// ---------------- 约课 ----------------
const bookVisible = ref(false)
const batchVisible = ref(false)
const preset = ref<SessionPreset | null>(null)
function book(batch = false) {
  if (!detail.value) return
  const t = detail.value.teachers
  const own = !auth.can('schedule.edit')
  preset.value = { kind: 'VIP', vipPackageId: detail.value.id, campusId: detail.value.student.campusId, teacherId: own ? auth.me?.id : t.length === 1 ?
    t[0].id : null }
  if (batch) batchVisible.value = true
  else bookVisible.value = true
}
const drawer = ref(false)
const currentId = ref<number | null>(null)
function openSession(id: number) {
  currentId.value = id
  drawer.value = true
}
const teacherNames = (p: { teachers: { name: string }[] }) => p.teachers.map((t) => t.name).join(t('schedule.listSeparator'))
const onPkgRow = (r: VipListItem) => openDetail(r.id)
const onSessionRow = (r: { id: number }) => openSession(r.id)
const isPast = (iso: string) => new Date(iso).getTime() <= Date.now()
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ t('schedule.menu.vip') }}</h2>
      <span class="spacer" />
      <el-button v-if="canManage" type="primary" icon="Plus" @click="openEdit()">{{ t('schedule.newLessonPackage') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="q.q" :placeholder="t('schedule.studentIdPackageName')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <el-select v-model="q.status" :placeholder="t('schedule.allStatuses')" clearable>
          <el-option value="ACTIVE" :label="t('schedule.enrolled')" /><el-option value="FINISHED" :label="t('schedule.completed')" />
        </el-select>
        <UserSelect v-if="canManage" v-model="q.teacherId" identity="TEACHER" :placeholder="t('schedule.allTeachers')" />
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <el-button type="primary" @click="search">{{ t('schedule.search') }}</el-button>
      </div>

      <div v-if="isMobile" v-loading="loading" class="cards">
        <div v-for="p in items" :key="p.id" class="vcard" @click="openDetail(p.id)">
          <div class="vc-head"><b>{{ p.student.name }}</b><span class="muted">{{ p.name }}</span><span class="spacer" /><DictTag
            dict="vipStatuses"
            :value="p.status"
          /></div>
          <HoursBar :total="p.totalHours" :used="p.usedHours" :pending="p.pendingHours" />
          <div class="muted" style="margin-top: 6px">{{
            p.teachers.map((t) => t.name).join(t('schedule.listSeparator'))
          }}<template v-if="p.nextSession"> {{
            t('schedule.nextSessionSummary', { p0: fmtMonthDay(p.nextSession.startAt), p1: timeRange(p.nextSession) })
          }}</template>
          </div>
        </div>
        <el-empty v-if="!items.length && !loading" :description="t('schedule.noLessonPackages')" />
      </div>
      <el-table v-else v-loading="loading" :data="items" @row-click="onPkgRow" row-class-name="clickable">
        <el-table-column :label="t('schedule.student')" min-width="120">
          <template #default="{ row }: any">
          <b>{{ row.student.name }}</b>
          <div class="muted">{{ row.student.studentNo }} · {{ row.student.campus?.name }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('schedule.lessonPackage')" min-width="160">
          <template #default="{ row }: any">{{ row.name }}<div class="muted">{{ row.subject }}</div></template>
        </el-table-column>
        <el-table-column :label="t('schedule.teacher')" min-width="110">
          <template #default="{ row }: any">{{ teacherNames(row) }}</template>
        </el-table-column>
        <el-table-column :label="t('schedule.hoursProgress')" min-width="280">
          <template #default="{ row }: any"><HoursBar :total="row.totalHours" :used="row.usedHours" :pending="row.pendingHours" /></template>
        </el-table-column>
        <el-table-column :label="t('schedule.nextLesson')" min-width="150">
          <template #default="{ row }: any">
            <template v-if="row.nextSession">{{
              fmtMonthDay(row.nextSession.startAt)
            }} {{
              timeRange(row.nextSession)
            }}<div class="muted">{{
              row.nextSession.room?.name
            }}</div>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="80">
        <template #default="{ row }: any">
        <DictTag dict="vipStatuses" :value="row.status" />
        </template>
        </el-table-column>
        <el-table-column v-if="canManage" :label="t('common.operation')" width="170" fixed="right">
          <template #default="{ row }: any">
            <div @click.stop>
              <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="primary" @click="toggleFinish(row)">{{
                row.status === 'ACTIVE' ? t('schedule.completed') : t('common.restore')
              }}</el-button>
              <el-button link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('schedule.noLessonPackages')" /></template>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          :small="isMobile"
          @current-change="reload"
        />
      </div>
    </div>

    <!-- 详情 -->
    <el-drawer
      v-model="detailVisible"
      :size="isMobile ? '100%' : '760px'"
      :title="detail ? `${detail.student.name} · ${detail.name}` : t('schedule.vipDetails')"
      append-to-body
    >
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="stat-grid d-stats">
            <div class="stat"><div class="stat-label">{{ t('schedule.totalHours') }}</div><div class="stat-value">{{ detail.totalHours }}h</div></div>
            <div class="stat">
            <div class="stat-label">{{ t('schedule.confirmed') }}</div>
            <div class="stat-value" style="color: var(--xh-teal)">{{ detail.usedHours }}h</div>
            </div>
            <div class="stat">
            <div class="stat-label">{{ t('schedule.pendingConfirmation') }}</div>
            <div class="stat-value" style="color: var(--xh-kind-vip)">{{ detail.pendingHours }}h</div>
            </div>
            <div class="stat"><div class="stat-label">{{ t('schedule.remaining') }}</div><div
              class="stat-value"
              :class="{ 'text-danger': detail.remaining <= 0 }"
            >{{ detail.remaining }}h</div></div>
          </div>
          <el-descriptions :column="isMobile ? 1 : 2" size="small" border>
            <el-descriptions-item :label="t('schedule.student')">{{ detail.student.name }}（{{ detail.student.studentNo }}）</el-descriptions-item>
            <el-descriptions-item :label="t('common.status')"><DictTag dict="vipStatuses" :value="detail.status" /></el-descriptions-item>
            <el-descriptions-item :label="t('schedule.subject')">{{ detail.subject || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('schedule.teacher')">{{
              detail.teachers.map((t) => t.name).join(t('schedule.listSeparator'))
            }}</el-descriptions-item>
            <el-descriptions-item :label="t('schedule.validity')">{{ detail.expireAt ? fmtDate(detail.expireAt) : '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('schedule.order')">{{ detail.order?.orderNo ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.note" :label="t('common.remark')" :span="2">{{ detail.note }}</el-descriptions-item>
          </el-descriptions>

          <div class="d-actions">
            <template v-if="canBook && detail.status === 'ACTIVE'">
              <el-button type="primary" icon="Plus" @click="book(false)">{{ t('schedule.bookLesson') }}</el-button>
              <el-button icon="Files" @click="book(true)">{{ t('schedule.bookMultipleLessons') }}</el-button>
            </template>
            <el-button v-if="canManage" icon="Edit" @click="openEdit(detail)">{{ t('common.edit') }}</el-button>
            <el-button v-if="canManage" @click="toggleFinish(detail)">{{
              detail.status === 'ACTIVE' ? t('schedule.completed') : t('schedule.restoreEnrollment')
            }}</el-button>
            <span class="spacer" />
            <el-checkbox v-model="showCancelled">{{ t('schedule.showCancelled') }}</el-checkbox>
          </div>

          <h3 class="page-title">{{ t('schedule.sessionsHeading', { p0: detailSessions.length }) }}</h3>
          <el-table :data="detailSessions" size="small" @row-click="onSessionRow" row-class-name="clickable">
            <el-table-column :label="t('schedule.time')" min-width="150">
              <template #default="{ row }: any">{{ fmtMonthDay(row.startAt) }} <b>{{ timeRange(row) }}</b></template>
            </el-table-column>
            <el-table-column v-if="!isMobile" :label="t('schedule.roomTeacher')" min-width="130">
              <template #default="{ row }: any">{{ row.room?.name ?? '—' }} · {{ row.teacher?.name ?? '—' }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.lessonHours')" width="60"><template #default="{ row }: any">{{ row.hours }}h</template></el-table-column>
            <el-table-column :label="t('common.status')" width="80">
            <template #default="{ row }: any">
            <DictTag dict="sessionStatuses" :value="row.status" />
            </template>
            </el-table-column>
            <el-table-column label="" width="70">
              <template #default="{ row }: any">
                <el-button v-if="row.canEdit && row.status === 'SCHEDULED' && isPast(row.startAt)" link type="primary" @click.stop="confirmSession(row.id)">{{
                  t('common.confirmTitle')
                }}</el-button>
                <el-button v-else link @click.stop="openSession(row.id)">{{ t('common.detail') }}</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty :description="t('schedule.noSessions')" :image-size="60" /></template>
          </el-table>
        </template>
      </div>
    </el-drawer>

    <!-- 编辑 -->
    <el-dialog
      v-model="editVisible"
      :title="editId ? t('schedule.editLessonPackage') : t('schedule.newLessonPackage')"
      :width="dlgWidth"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="90px" :disabled="saving">
        <el-form-item :label="t('schedule.learner')" required>
        <StudentSelect v-model="form.studentId" :disabled="!!editId" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('schedule.name')" required><el-input
          v-model="form.name"
          maxlength="100"
          :placeholder="t('schedule.eGOneToOneGraduateEconomics')"
        /></el-form-item>
        <el-form-item :label="t('schedule.subject')"><el-input v-model="form.subject" maxlength="50" /></el-form-item>
        <el-form-item :label="t('schedule.totalHours')" required>
          <el-input-number v-model="form.totalHours" :min="minTotal || 0.5" :max="10000" :step="1" :precision="2" />
          <span v-if="minTotal" class="muted" style="margin-left: 8px">{{ t('schedule.atLeastConfirmedPendingH', { p0: minTotal }) }}</span>
        </el-form-item>
        <el-form-item :label="t('schedule.assignedTeacher')" required>
        <UserSelect v-model="form.teacherIds" identity="TEACHER" multiple style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('schedule.validUntil')">
        <el-date-picker v-model="form.expireAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <SessionDialog v-model="bookVisible" :preset="preset" @saved="refreshAll" />
    <BatchDialog v-model="batchVisible" :preset="preset" @saved="refreshAll" />
    <SessionDrawer v-model="drawer" :session-id="currentId" @changed="refreshAll" />
  </div>
</template>

<style scoped>
.cards { display: flex; flex-direction: column; gap: 10px; }
.vcard { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; cursor: pointer; }
.vc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vc-head .spacer, .d-actions .spacer { flex: 1; }
.d-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0; }
.d-actions .el-button { margin-left: 0; }
:deep(.clickable) { cursor: pointer; }
.d-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 767px) { .d-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
