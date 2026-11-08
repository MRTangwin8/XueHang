<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教学服务 · 出勤管理（点名 / 出勤统计） */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { fmtDate, fmtTime, toApi, tz, dayjs } from '@/utils/time'
import { downloadFile, useIsMobile } from '@/utils/format'
import UserSelect from '@/components/UserSelect.vue'
import StudentSelect from '@/components/StudentSelect.vue'
import { attendanceApi, type AttSession, type AttStats, type IdName } from '../api'
import RollCallDialog from '../components/RollCallDialog.vue'
import RosterDrawer from '../components/RosterDrawer.vue'

const { t: tr } = useI18n()

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const canAll = computed(() => auth.can('schedule.edit'))

const tab = ref((route.query.tab as string) === 'stats' ? 'stats' : 'roll')
const classGroups = ref<{ id: number; name: string; status: string }[]>([])
const products = ref<IdName[]>([])
const num = (v: unknown) => (v ? Number(v) : null)
const range = (a: unknown, b: unknown): [string, string] | null => (a && b ? [String(a), String(b)] : null)

// ---------------- 点名 ----------------
const rq = reactive({
  classGroupId: num(route.query.classGroupId),
  teacherId: num(route.query.teacherId),
  range: range(route.query.from, route.query.to) ?? [tz().subtract(14, 'day').format('YYYY-MM-DD'), tz().add(7, 'day').format('YYYY-MM-DD')],
  page: Number(route.query.page) || 1,
  pageSize: 20,
})
const sessions = ref<AttSession[]>([])
const total = ref(0)
const loading = ref(false)
const sheetId = ref<number | null>(num(route.query.session))
const rosterId = ref<number | null>(null)

async function loadSessions() {
  loading.value = true
  try {
    const r = await attendanceApi.sessions({
      classGroupId: rq.classGroupId || undefined,
      teacherId: rq.teacherId || undefined,
      from: rq.range?.[0] ? toApi(rq.range[0]) : undefined,
      to: rq.range?.[1] ? toApi(rq.range[1]) : undefined,
      page: rq.page,
      pageSize: rq.pageSize,
    })
    sessions.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function syncRoll() {
  router.replace({
    query: {
      tab: undefined,
      classGroupId: rq.classGroupId || undefined,
      teacherId: rq.teacherId || undefined,
      from: rq.range?.[0],
      to: rq.range?.[1],
      page: rq.page > 1 ? String(rq.page) : undefined,
    },
  })
  loadSessions()
}
function searchRoll() {
  rq.page = 1
  syncRoll()
}
function openRoster() {
  if (!rq.classGroupId) return ElMessage.warning(tr('service.text.selectAClassInTheFiltersFirst'))
  rosterId.value = rq.classGroupId
}
const isFuture = (s: AttSession) => +new Date(s.startAt) > Date.now()
const isToday = (s: AttSession) => tz(s.startAt).format('YYYY-MM-DD') === tz().format('YYYY-MM-DD')

// ---------------- 统计 ----------------
const sq = reactive({
  classGroupId: num(route.query.classGroupId),
  studentId: num(route.query.studentId),
  productId: num(route.query.productId),
  range: range(route.query.from, route.query.to) ?? [tz().startOf('month').format('YYYY-MM-DD'), tz().format('YYYY-MM-DD')],
})
const stats = ref<AttStats | null>(null)
const statsLoading = ref(false)
const statParams = () => ({
  classGroupId: sq.classGroupId || undefined,
  studentId: sq.studentId || undefined,
  productId: sq.productId || undefined,
  from: sq.range?.[0] ? toApi(sq.range[0]) : undefined,
  to: sq.range?.[1] ? toApi(sq.range[1]) : undefined,
})
async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await attendanceApi.stats(statParams())
  } finally {
    statsLoading.value = false
  }
}
function searchStats() {
  router.replace({
    query: {
      tab: 'stats',
      classGroupId: sq.classGroupId || undefined,
      studentId: sq.studentId || undefined,
      productId: sq.productId || undefined,
      from: sq.range?.[0],
      to: sq.range?.[1],
    },
  })
  loadStats()
}
const exporting = ref(false)
async function exportXlsx() {
  exporting.value = true
  try {
    const qs = new URLSearchParams(Object.entries(statParams()).filter(([, v]) => v != null) as [string, string][]).toString()
    await downloadFile(`/api/service/attendance/export?${qs}`, tr('service.text.attendanceXlsx', { v0: dayjs().format('YYYYMMDD') }))
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    exporting.value = false
  }
}
const printTitle = computed(() => {
  const cg = classGroups.value.find((c) => c.id === sq.classGroupId)
  return tr('service.text.attendanceStatistics', { v0: cg ? ' · ' + cg.name : '', v1: sq.range?.[0] ?? '', v2: sq.range?.[1] ?? '' })
})
const printPage = () => window.print()
const rateColor = (r: number | null) => (r == null ? '#94a3b8' : r >= 90 ? '#059669' : r >= 75 ? '#d97706' : '#dc2626')

function switchTab(t: string | number) {
  if (t === 'stats') searchStats()
  else syncRoll()
}

onMounted(async () => {
  attendanceApi.classGroups().then((r) => (classGroups.value = r))
  attendanceApi.products().then((r) => (products.value = r))
  if (tab.value === 'stats') loadStats()
  else loadSessions()
})
</script>

<template>
  <div class="page att-page">
    <el-tabs v-model="tab" class="no-print" @tab-change="switchTab">
      <el-tab-pane :label="tr('service.text.takeAttendance')" name="roll" />
      <el-tab-pane :label="tr('service.text.attendanceStatistics2')" name="stats" />
    </el-tabs>
    <!-- 点名 -->
    <div v-if="tab === 'roll'" class="page-card">
      <div class="toolbar">
        <el-select v-model="rq.classGroupId" :placeholder="tr('service.text.allGroupClasses')" clearable filterable @change="searchRoll">
          <el-option v-for="c in classGroups" :key="c.id" :value="c.id" :label="c.name" />
        </el-select>
        <UserSelect v-if="canAll" v-model="rq.teacherId" identity="TEACHER" :placeholder="tr('service.text.allTeachers')" @change="searchRoll" />
        <el-date-picker
          v-model="rq.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          :range-separator="tr('common.to')"
          :start-placeholder="tr('service.text.start')"
          :end-placeholder="tr('service.text.end')"
          style="width: 260px"
          @change="searchRoll" />
        <span class="spacer" />
        <el-button icon="User" @click="openRoster">{{ tr('service.text.classRoster2') }}</el-button>
      </div>

      <el-table v-if="!isMobile" v-loading="loading" :data="sessions">
        <el-table-column :label="tr('service.text.classTime')" width="190">
          <template #default="{ row }">
            <div>
              {{ fmtDate(row.startAt) }}
              {{ tz(row.startAt).format('ddd') }}
              <el-tag v-if="isToday(row as AttSession)" size="small" type="success" style="margin-left: 6px">{{ tr('common.today') }}</el-tag>
            </div>
            <div class="muted">{{ fmtTime(row.startAt) }} - {{ fmtTime(row.endAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.groupClass')" min-width="180">
          <template #default="{ row }">{{ row.classGroup?.name ?? row.title }}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.room')" width="110"><template #default="{ row }">{{ row.room?.name }}</template></el-table-column>
        <el-table-column :label="tr('service.text.teacher')" width="100"><template #default="{ row }">{{ row.teacher?.name }}</template></el-table-column>
        <el-table-column :label="tr('service.text.expected')" width="70" align="center" prop="expected" />
        <el-table-column :label="tr('service.text.recorded')" width="80" align="center">
          <template #default="{ row }">
            <span :class="{ 'text-danger': !isFuture(row as AttSession) && row.recorded < row.expected }">{{ row.recorded }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.presentAbsentOnLeave')" width="140" align="center">
          <template #default="{ row }">
            <template v-if="row.recorded">
              <span class="text-success">{{ row.attended }}</span> /
              <span class="text-danger">{{ row.absent }}</span> /
              {{ row.leave }}
            </template>
            <span v-else class="muted">{{ tr('service.text.notMarked') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="sheetId = row.id">
              {{ row.recorded ? tr('service.text.editAttendance') : tr('service.text.takeAttendance') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="tr('service.text.noGroupClassSessionsInThisRange')" /></template>
      </el-table>
      <div v-else v-loading="loading" class="m-list">
        <el-empty v-if="!sessions.length" :description="tr('service.text.noGroupClassSessionsInThisRange')" />
        <div v-for="s in sessions" :key="s.id" class="m-item" @click="sheetId = s.id">
          <div class="m-top">
            <b>{{ s.classGroup?.name ?? s.title }}</b>
            <el-tag v-if="s.recorded" size="small" type="success">{{ tr('service.text.marked') }} {{ s.recorded }}/{{ s.expected }}</el-tag>
            <el-tag v-else size="small" type="info">{{ tr('service.text.notMarked') }}</el-tag>
          </div>
          <div class="muted">
            {{ fmtDate(s.startAt) }}
            {{ tz(s.startAt).format('ddd') }}
            {{ fmtTime(s.startAt) }}-
            {{ fmtTime(s.endAt) }} ·
            {{ s.room?.name }} ·
            {{ s.teacher?.name }}
          </div>
        </div>
      </div>
      <div class="pager">
        <el-pagination
          v-model:current-page="rq.page"
          :page-size="rq.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="syncRoll" />
      </div>
    </div>
    <!-- 统计 -->
    <template v-else>
      <div class="page-card no-print">
        <div class="toolbar" style="margin-bottom: 0">
          <el-select v-model="sq.classGroupId" :placeholder="tr('service.text.allClasses')" clearable filterable @change="searchStats">
            <el-option v-for="c in classGroups" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
          <el-select v-model="sq.productId" :placeholder="tr('service.text.allCourses')" clearable filterable @change="searchStats">
            <el-option v-for="p in products" :key="p.id" :value="p.id" :label="p.name" />
          </el-select>
          <StudentSelect v-model="sq.studentId" :placeholder="tr('service.text.student')" @change="searchStats" />
          <el-date-picker
            v-model="sq.range"
            type="daterange"
            value-format="YYYY-MM-DD"
            :range-separator="tr('common.to')"
            :start-placeholder="tr('service.text.start')"
            :end-placeholder="tr('service.text.end')"
            style="width: 260px"
            @change="searchStats" />
          <span class="spacer" />
          <el-button icon="Download" :loading="exporting" @click="exportXlsx">{{ tr('service.text.exportExcel') }}</el-button>
          <el-button icon="Printer" @click="printPage">{{ tr('service.text.printPdf') }}</el-button>
        </div>
      </div>

      <div v-loading="statsLoading">
        <h2 class="print-only">{{ printTitle }}</h2>
        <div v-if="stats" class="stat-grid">
          <div class="stat"><div class="stat-label">{{ tr('service.text.classes') }}</div><div class="stat-value">{{ stats.summary.classes }}</div></div>
          <div class="stat">
            <div class="stat-label">{{ tr('service.text.sessionsStarted') }}</div>
            <div class="stat-value">{{ stats.summary.sessions }}</div>
          </div>
          <div class="stat"><div class="stat-label">{{ tr('service.text.students3') }}</div><div class="stat-value">{{ stats.summary.students }}</div></div>
          <div class="stat">
            <div class="stat-label">{{ tr('service.text.expectedActualAttendanceStudentSessions') }}</div>
            <div class="stat-value">{{ stats.summary.slots }} / {{ stats.summary.attended }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">{{ tr('service.text.overallAttendanceRate') }}</div>
            <div class="stat-value" :style="{ color: rateColor(stats.summary.rate) }">{{ stats.summary.rate == null ? '—' : stats.summary.rate + '%' }}</div>
          </div>
        </div>

        <div class="page-card">
          <h3 class="page-title">{{ tr('service.text.byStudent') }}</h3>
          <el-alert type="info" :closable="false" show-icon class="formula">
            {{ tr('service.text.attendanceRateSessionsAttendedTotalSessions100AttendedSessions') }}
          </el-alert>
          <el-table :data="stats?.students ?? []" size="small">
            <el-table-column :label="tr('auth.studentNo')" prop="studentNo" width="110" />
            <el-table-column :label="tr('profile.name')" prop="name" width="90" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.class')" min-width="160">
              <template #default="{ row }">{{ row.classNames.join('、') }}</template>
            </el-table-column>
            <el-table-column :label="tr('service.text.totalSessions')" prop="total" width="70" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.present')" prop="present" width="60" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.late')" prop="late" width="60" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.leftEarly')" prop="earlyLeave" width="60" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.absent')" width="60" align="center">
              <template #default="{ row }"><span :class="{ 'text-danger': row.absent }">{{ row.absent }}</span></template>
            </el-table-column>
            <el-table-column v-if="!isMobile" :label="tr('service.text.onLeave')" prop="leave" width="60" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.unrecorded')" prop="unrecorded" width="70" align="center" />
            <el-table-column :label="tr('service.text.attendanceRate')" min-width="150">
              <template #default="{ row }">
                <div class="rate">
                  <el-progress :percentage="row.rate ?? 0" :color="rateColor(row.rate)" :show-text="false" :stroke-width="8" style="flex: 1" />
                  <b :style="{ color: rateColor(row.rate) }">{{ row.rate == null ? '—' : row.rate + '%' }}</b>
                </div>
                <div class="muted">{{ row.attended }} / {{ row.total }}</div>
              </template>
            </el-table-column>
            <template #empty><el-empty :description="tr('service.text.noStatisticsAvailable')" /></template>
          </el-table>
        </div>

        <div class="page-card">
          <h3 class="page-title">{{ tr('service.text.byClass') }}</h3>
          <el-table :data="stats?.byClass ?? []" size="small">
            <el-table-column :label="tr('service.text.class')" prop="name" min-width="180" />
            <el-table-column :label="tr('service.text.student')" prop="students" width="70" align="center" />
            <el-table-column :label="tr('service.text.sessionsStarted')" prop="sessions" width="90" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.expectedAttendances')" prop="slots" width="100" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.actualAttendances')" prop="attended" width="90" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.absent')" prop="absent" width="70" align="center" />
            <el-table-column v-if="!isMobile" :label="tr('service.text.onLeave')" prop="leave" width="70" align="center" />
            <el-table-column :label="tr('service.text.attendanceRate')" width="100" align="center">
              <template #default="{ row }"><b :style="{ color: rateColor(row.rate) }">{{ row.rate == null ? '—' : row.rate + '%' }}</b></template>
            </el-table-column>
            <template #empty><el-empty :description="tr('common.noData')" /></template>
          </el-table>
        </div>
      </div>
    </template>

    <RollCallDialog :session-id="sheetId" @close="sheetId = null" @saved="loadSessions" />
    <RosterDrawer :class-group-id="rosterId" @close="rosterId = null" @changed="loadSessions" />
  </div>
</template>

<style scoped>
.m-list { display: flex; flex-direction: column; gap: 8px; }
.m-item { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; }
.m-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.rate { display: flex; align-items: center; gap: 8px; }
.formula { margin-bottom: 12px; }
.print-only { display: none; }
</style>

<style>
@media print {
  .print-only { display: block !important; font-size: 18px; margin: 0 0 12px; }
  .layout .sidebar, .layout .topbar { display: none !important; }
  .layout, .layout .main, .layout .content { display: block !important; height: auto !important; overflow: visible !important; }
  .att-page .page-card, .att-page .stat { box-shadow: none !important; break-inside: avoid; }
}
</style>
