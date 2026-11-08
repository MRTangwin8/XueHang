<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 班课管理：CRUD + 学生名单 + 排课（批量） */
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import RoomSelect from '@/components/RoomSelect.vue'
import StudentSelect from '@/components/StudentSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDate, fmtMonthDay, fmtTime } from '@/utils/time'
import { useAuth } from '@/stores/auth'
import { scheduleApi, type ClassDetail, type ClassGroup, type SessionPreset } from '../api'
import BatchDialog from '../components/BatchDialog.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('560px')

const q = reactive({
  q: (route.query.q as string) || '',
  campusId: route.query.campusId ? Number(route.query.campusId) : null,
  status: (route.query.status as string) ?? 'ACTIVE',
  page: Number(route.query.page) || 1,
  pageSize: 20,
})
const items = ref<ClassGroup[]>([])
const total = ref(0)
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const r = await scheduleApi.classes({ ...q })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function reload() {
  router.replace({ query: { q: q.q || undefined, campusId: q.campusId ?? undefined, status: q.status, page: q.page > 1 ? q.page : undefined } })
  load()
}
function search() {
  q.page = 1
  reload()
}
watch(() => [q.campusId, q.status], search)
onMounted(load)

// ---------------- 编辑 ----------------
const editVisible = ref(false)
const editId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({
  campusId: null as number | null, name: '', subject: '', teacherId: null as number | null, defaultRoomId: null as number | null,
  dates: null as [string, string] | null, note: '', studentIds: [] as number[],
})
function openEdit(c?: ClassGroup) {
  editId.value = c?.id ?? null
  Object.assign(form, c
    ? { campusId: c.campusId, name: c.name, subject: c.subject ?? '', teacherId: c.teacherId, defaultRoomId: c.defaultRoomId, dates: c.startDate &&
      c.endDate ? [fmtDate(c.startDate), fmtDate(c.endDate)] : null, note: c.note ?? '', studentIds: [] }
    : { campusId: auth.me?.campusId ?? null, name: '', subject: '', teacherId: null, defaultRoomId: null, dates: null, note: '', studentIds: [] })
  editVisible.value = true
}
async function save() {
  if (!form.campusId) return ElMessage.warning(t('schedule.pleaseSelectACampus'))
  if (!form.name.trim()) return ElMessage.warning(t('schedule.pleaseEnterTheClassName'))
  saving.value = true
  try {
    const { dates, studentIds, ...rest } = form
    await scheduleApi.saveClass(
      { ...rest, name: rest.name.trim(), startDate: dates?.[0] ?? null, endDate: dates?.[1] ?? null, ...(editId.value ? {} : { studentIds }) },
      editId.value ?? undefined,
    )
    ElMessage.success(t('common.saved'))
    editVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}
async function toggleFinish(c: ClassGroup) {
  const finish = c.status === 'ACTIVE'
  try {
    await ElMessageBox.confirm(finish ? t('schedule.markAsEnded', { p0: c.name }) : t('schedule.restoreToInProgress', { p0: c.name }),
      t('schedule.notice'), { type: 'warning' })
  } catch {
    return
  }
  await (finish ? scheduleApi.finishClass(c.id) : scheduleApi.reopenClass(c.id))
  ElMessage.success(t('schedule.updated'))
  load()
}
async function remove(c: ClassGroup) {
  try {
    await ElMessageBox.confirm(t('schedule.deleteGroupClassCancelUpcomingSessionsFirst', { p0: c.name }), t('common.delete'), { type: 'warning' })
  } catch {
    return
  }
  await scheduleApi.deleteClass(c.id)
  ElMessage.success(t('common.deleted'))
  load()
}

// ---------------- 学生名单 ----------------
const stuVisible = ref(false)
const detail = ref<ClassDetail | null>(null)
const addIds = ref<number[]>([])
async function openStudents(c: ClassGroup) {
  stuVisible.value = true
  addIds.value = []
  detail.value = await scheduleApi.classDetail(c.id)
}
async function addStudents() {
  if (!detail.value || !addIds.value.length) return
  const r = await scheduleApi.addClassStudents(detail.value.id, addIds.value)
  ElMessage.success(t('schedule.addedStudents', { p0: r.added }))
  addIds.value = []
  detail.value = await scheduleApi.classDetail(detail.value.id)
  load()
}
async function removeStudent(sid: number, name: string) {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(t('schedule.removeFromThisClass', { p0: name }), t('schedule.notice'), { type: 'warning' })
  } catch {
    return
  }
  await scheduleApi.removeClassStudent(detail.value.id, sid)
  detail.value = await scheduleApi.classDetail(detail.value.id)
  load()
}

// ---------------- 排课 ----------------
const batchVisible = ref(false)
const preset = ref<SessionPreset | null>(null)
function schedule(c: ClassGroup) {
  preset.value = { kind: 'CLASS', classGroupId: c.id, campusId: c.campusId, roomId: c.defaultRoomId, teacherId: c.teacherId }
  batchVisible.value = true
}
function viewTimetable(c: ClassGroup) {
  router.push({ path: '/schedule/timetable', query: { classGroupId: c.id, campusId: c.campusId } })
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ t('schedule.menu.classes') }}</h2>
      <span class="spacer" />
      <el-button type="primary" icon="Plus" @click="openEdit()">{{ t('schedule.newGroupClass') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="q.q" :placeholder="t('schedule.classNameSubject')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <el-select v-model="q.status" :placeholder="t('schedule.allStatuses')" clearable>
          <el-option value="ACTIVE" :label="t('schedule.inProgress')" /><el-option value="FINISHED" :label="t('schedule.courseEnded')" />
        </el-select>
        <el-button type="primary" @click="search">{{ t('schedule.search') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="t('schedule.class')" min-width="180">
          <template #default="{ row }: any"><b>{{ row.name }}</b><div class="muted">{{ row.subject }}</div></template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="t('common.campus')" prop="campus.name" width="110" />
        <el-table-column :label="t('schedule.teacher')" width="100">
        <template #default="{ row }: any">{{ row.teacher?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="t('schedule.defaultRoom')" width="110">
        <template #default="{ row }: any">{{ row.defaultRoom?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="t('schedule.student')" width="70" align="center">
        <template #default="{ row }: any">{{ row.studentCount }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="t('schedule.sessions')" width="70" align="center">
        <template #default="{ row }: any">{{ row.sessionCount }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="t('schedule.recurrence')" min-width="170">
          <template #default="{ row }: any">{{ row.startDate ? `${fmtDate(row.startDate)} ~ ${fmtDate(row.endDate)}` : '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="80">
          <template #default="{ row }: any">
          <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small" disable-transitions>{{
            row.status === 'ACTIVE' ? t('schedule.inProgress') : t('schedule.courseEnded')
          }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" :width="isMobile ? 120 : 300" fixed="right">
          <template #default="{ row }: any">
            <el-button v-if="row.status === 'ACTIVE'" link type="primary" @click="schedule(row)">{{ t('schedule.scheduleSessions') }}</el-button>
            <el-button link type="primary" @click="openStudents(row)">{{ t('schedule.student') }}</el-button>
            <template v-if="!isMobile">
              <el-button link type="primary" @click="viewTimetable(row)">{{ t('schedule.classTimetable') }}</el-button>
              <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="primary" @click="toggleFinish(row)">{{
                row.status === 'ACTIVE' ? t('schedule.endCourse') : t('common.restore')
              }}</el-button>
              <el-button link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            </template>
            <el-dropdown v-else trigger="click">
              <el-button link type="primary">{{ t('common.more') }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="viewTimetable(row)">{{ t('schedule.classTimetable') }}</el-dropdown-item>
                  <el-dropdown-item @click="openEdit(row)">{{ t('common.edit') }}</el-dropdown-item>
                  <el-dropdown-item @click="toggleFinish(row)">{{ row.status === 'ACTIVE' ? t('schedule.endCourse') : t('common.restore') }}</el-dropdown-item>
                  <el-dropdown-item @click="remove(row)">{{ t('common.delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('schedule.noGroupClasses')" /></template>
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

    <el-dialog
      v-model="editVisible"
      :title="editId ? t('schedule.editGroupClass') : t('schedule.newGroupClass')"
      :width="dlgWidth"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="84px" :disabled="saving">
        <el-form-item :label="t('common.campus')" required><CampusSelect
          v-model="form.campusId"
          :clearable="false"
          :placeholder="t('schedule.selectCampus')"
          style="width: 100%"
        /></el-form-item>
        <el-form-item :label="t('schedule.className')" required><el-input v-model="form.name" maxlength="100" /></el-form-item>
        <el-form-item :label="t('schedule.subject')">
        <el-input v-model="form.subject" maxlength="50" :placeholder="t('schedule.eGEjuJapanese')" />
        </el-form-item>
        <el-form-item :label="t('schedule.assignedTeacher')"><UserSelect v-model="form.teacherId" identity="TEACHER" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('schedule.defaultRoom')">
        <RoomSelect v-model="form.defaultRoomId" :campus-id="form.campusId" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('schedule.coursePeriod')">
          <el-date-picker
            v-model="form.dates"
            type="daterange"
            value-format="YYYY-MM-DD"
            :range-separator="t('common.to')"
            :start-placeholder="t('schedule.start')"
            :end-placeholder="t('schedule.end')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="!editId" :label="t('schedule.student')">
        <StudentSelect v-model="form.studentIds" multiple status="ENROLLED" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="stuVisible"
      :title="detail ? t('schedule.studentRoster', { p0: detail.name }) : t('schedule.studentRosterTitle')"
      :size="isMobile ? '100%' : '520px'"
      append-to-body
    >
      <template v-if="detail">
        <div class="muted" style="margin-bottom: 12px">
          {{
            t('schedule.teacherDefaultRoomSessionsScheduled', { p0: detail.teacher?.name ?? '—', p1: detail.defaultRoom?.name ?? '—',
              p2: (detail.sessionStats.SCHEDULED ?? 0) + (detail.sessionStats.CONFIRMED ?? 0) })
          }}
          <template v-if="detail.nextSession"> {{
            t('schedule.next', { p0: fmtMonthDay(detail.nextSession.startAt), p1: fmtTime(detail.nextSession.startAt), p2: detail.nextSession.room?.name })
          }}</template>
        </div>
        <div class="add-row">
          <StudentSelect v-model="addIds" multiple status="ENROLLED" :placeholder="t('schedule.searchAndAddStudents')" style="flex: 1" />
          <el-button type="primary" :disabled="!addIds.length" @click="addStudents">{{ t('schedule.add') }}</el-button>
        </div>
        <el-table :data="detail.students" size="small">
          <el-table-column :label="t('profile.name')" prop="name" />
          <el-table-column :label="t('auth.studentNo')" prop="studentNo" />
          <el-table-column :label="t('schedule.joined')" width="100"><template #default="{ row }: any">{{ fmtDate(row.joinedAt) }}</template></el-table-column>
          <el-table-column width="70">
          <template #default="{ row }: any">
          <el-button link type="danger" @click="removeStudent(row.id, row.name)">{{ t('schedule.remove') }}</el-button>
          </template>
          </el-table-column>
          <template #empty><el-empty :description="t('schedule.noStudents')" :image-size="60" /></template>
        </el-table>
      </template>
    </el-drawer>

    <BatchDialog v-model="batchVisible" :preset="preset" @saved="load" />
  </div>
</template>

<style scoped>
.add-row { display: flex; gap: 8px; margin-bottom: 12px; }
</style>
