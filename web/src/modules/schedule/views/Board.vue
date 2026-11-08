<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教室预约：班课 / VIP / 其他占用 统一在「教室 × 时间」网格上显示与预约 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CampusSelect from '@/components/CampusSelect.vue'
import { useAuth } from '@/stores/auth'
import { today, toApi, dayjs } from '@/utils/time'
import { scheduleApi, type Room, type SessionItem, type SessionPreset } from '../api'
import { weekdayLabel, addDays, mondayOf } from '../utils'
import RoomBoard from '../components/RoomBoard.vue'
import SessionDialog from '../components/SessionDialog.vue'
import BatchDialog from '../components/BatchDialog.vue'
import SessionDrawer from '../components/SessionDrawer.vue'
import KindLegend from '../components/KindLegend.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const canCreate = computed(() => auth.can(['schedule.edit', 'schedule.own']))

const q = reactive({
  campusId: route.query.campusId ? Number(route.query.campusId) : auth.me?.campusId ?? null,
  date: (route.query.date as string) || today(),
  view: (route.query.view as 'day' | 'week') || 'day',
  building: (route.query.building as string) || '',
  kinds: route.query.kinds ? String(route.query.kinds).split(',') : ['CLASS', 'VIP', 'OTHER'],
})

const rooms = ref<Room[]>([])
const sessions = ref<SessionItem[]>([])
const loading = ref(false)

const range = computed(() => (q.view === 'day' ? { from: q.date, to: addDays(q.date, 1) } : { from: mondayOf(q.date), to: addDays(mondayOf(q.date), 7) }))
const buildings = computed(() => [...new Set(rooms.value.map((r) => r.building || t('schedule.other')))])
const shownRooms = computed(() => (q.building ? rooms.value.filter((r) => (r.building || t('schedule.other')) === q.building) : rooms.value))
const shownSessions = computed(() => {
  const ids = new Set(shownRooms.value.map((r) => r.id))
  return sessions.value.filter((s) => q.kinds.includes(s.kind) && (s.roomId ? ids.has(s.roomId) : !q.building))
})
const counts = computed(() => {
  const c = { CLASS: 0, VIP: 0, OTHER: 0 } as Record<string, number>
  shownSessions.value.forEach((s) => c[s.kind]++)
  return c
})

async function loadRooms() {
  rooms.value = await scheduleApi.rooms(q.campusId)
  if (q.building && !buildings.value.includes(q.building)) q.building = ''
}
async function loadSessions() {
  loading.value = true
  try {
    sessions.value = await scheduleApi.sessions({ from: toApi(range.value.from), to: toApi(range.value.to), campusId: q.campusId })
  } finally {
    loading.value = false
  }
}
function syncUrl() {
  router.replace({ query: { campusId: q.campusId ?? undefined, date: q.date, view: q.view, building: q.building || undefined,
    kinds: q.kinds.length === 3 ? undefined : q.kinds.join(',') } })
}

onMounted(async () => {
  await Promise.all([loadRooms(), loadSessions()])
})
watch(() => q.campusId, async () => {
  syncUrl()
  await Promise.all([loadRooms(), loadSessions()])
})
watch(() => [q.date, q.view], () => {
  syncUrl()
  loadSessions()
})
watch(() => [q.building, q.kinds], syncUrl, { deep: true })

function shift(n: number) {
  q.date = addDays(q.date, q.view === 'day' ? n : n * 7)
}
const dateLabel = computed(() => {
  if (q.view === 'day') return `${q.date} ${weekdayLabel(dayjs(q.date).isoWeekday())}`
  const m = mondayOf(q.date)
  return `${m} ~ ${addDays(m, 6).slice(5)}`
})

// ---------------- 对话框 ----------------
const dlg = ref(false)
const preset = ref<SessionPreset | null>(null)
const batchVisible = ref(false)
const drawer = ref(false)
const currentId = ref<number | null>(null)

function create(p?: SessionPreset) {
  preset.value = { campusId: q.campusId, date: q.view === 'day' ? q.date : undefined, ...p }
  dlg.value = true
}
function openBatch() {
  preset.value = { campusId: q.campusId }
  batchVisible.value = true
}
function open(id: number) {
  currentId.value = id
  drawer.value = true
}
</script>

<template>
  <div class="page">
    <div class="page-card board-card">
      <div class="toolbar">
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <div class="date-nav">
          <el-button-group>
            <el-button icon="ArrowLeft" @click="shift(-1)" />
            <el-button @click="q.date = today()">{{ t('common.today') }}</el-button>
            <el-button icon="ArrowRight" @click="shift(1)" />
          </el-button-group>
          <el-date-picker v-model="q.date" type="date" value-format="YYYY-MM-DD" :clearable="false" class="date-pick" />
        </div>
        <el-radio-group v-model="q.view">
          <el-radio-button value="day">{{ t('schedule.day') }}</el-radio-button>
          <el-radio-button value="week">{{ t('schedule.week') }}</el-radio-button>
        </el-radio-group>
        <el-select v-model="q.building" :placeholder="t('schedule.allBuildings')" clearable class="bld">
          <el-option v-for="b in buildings" :key="b" :value="b" :label="b" />
        </el-select>
        <el-checkbox-group v-model="q.kinds" class="kinds">
          <el-checkbox-button value="CLASS">{{ t('schedule.groupClass') }}</el-checkbox-button>
          <el-checkbox-button value="VIP">VIP</el-checkbox-button>
          <el-checkbox-button value="OTHER">{{ t('schedule.other') }}</el-checkbox-button>
        </el-checkbox-group>
        <span class="spacer" />
        <template v-if="canCreate">
          <el-button type="primary" icon="Plus" @click="create()">{{ t('common.create') }}</el-button>
          <el-button icon="Files" @click="openBatch">{{ t('schedule.batchScheduling') }}</el-button>
        </template>
      </div>

      <div class="summary">
        <span class="date-label">{{ dateLabel }}</span>
        <span class="muted">{{ t('schedule.sessionsGroupVipOther', { p0: shownSessions.length, p1: counts.CLASS, p2: counts.VIP, p3: counts.OTHER }) }}</span>
        <span class="spacer" />
        <KindLegend />
        <span v-if="canCreate" class="muted hint">{{ t('schedule.clickAnEmptySlotToBook') }}</span>
      </div>

      <div v-loading="loading">
        <RoomBoard
          :rooms="shownRooms"
          :sessions="shownSessions"
          :mode="q.view"
          :date="q.view === 'day' ? q.date : mondayOf(q.date)"
          :can-create="canCreate"
          @create="create"
          @open="open"
        />
      </div>
    </div>

    <SessionDialog v-model="dlg" :preset="preset" @saved="loadSessions" />
    <BatchDialog v-model="batchVisible" :preset="preset" @saved="loadSessions" />
    <SessionDrawer v-model="drawer" :session-id="currentId" @changed="loadSessions" />
  </div>
</template>

<style scoped>
.board-card { padding-bottom: 14px; }
.toolbar .el-button + .el-button { margin-left: 0; }
.date-nav { display: flex; gap: 8px; align-items: center; }
.toolbar .date-pick { width: 150px; }
.toolbar .bld { width: 130px; }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 10px; }
.summary .spacer { flex: 1; }
.date-label { font-weight: 650; font-size: 15px; }
.hint { padding-left: 4px; }
@media (max-width: 767px) {
  .date-nav { flex-wrap: wrap; }
  .toolbar .date-pick { flex: 1; width: auto !important; }
  .hint { display: none; }
}
</style>
