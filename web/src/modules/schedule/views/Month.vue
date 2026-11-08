<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 月课表：月历每天列出课次（「HH:mm 教室 标题」），筛选校区 / 教室 / 老师；
 * 切换「按教室」：左侧教室列、上方日期的矩阵。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CampusSelect from '@/components/CampusSelect.vue'
import RoomSelect from '@/components/RoomSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useIsMobile } from '@/utils/format'
import { dayjs, fmtTime, today, toApi } from '@/utils/time'
import { scheduleApi, type Room, type SessionItem, type SessionPreset } from '../api'
import { weekdayLabel, addDays, dateOf, kindStyle, mondayOf, timeRange } from '../utils'
import KindLegend from '../components/KindLegend.vue'
import SessionDialog from '../components/SessionDialog.vue'
import SessionDrawer from '../components/SessionDrawer.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMobile = useIsMobile()
const canCreate = computed(() => auth.can(['schedule.edit', 'schedule.own']))

const q = reactive({
  month: (route.query.month as string) || today().slice(0, 7),
  mode: (route.query.mode as 'calendar' | 'room') || 'calendar',
  campusId: route.query.campusId ? Number(route.query.campusId) : auth.me?.campusId ?? null,
  roomId: route.query.roomId ? Number(route.query.roomId) : null,
  teacherId: route.query.teacherId ? Number(route.query.teacherId) : null,
  kind: (route.query.kind as string) || '',
})
const list = ref<SessionItem[]>([])
const rooms = ref<Room[]>([])
const loading = ref(false)

const monthStart = computed(() => `${q.month}-01`)
const monthDays = computed(() => dayjs(monthStart.value).daysInMonth())
const monthDates = computed(() => Array.from({ length: monthDays.value }, (_, i) => addDays(monthStart.value, i)))
const gridStart = computed(() => mondayOf(monthStart.value))
const gridDates = computed(() => {
  const last = addDays(monthStart.value, monthDays.value - 1)
  const end = addDays(mondayOf(last), 6)
  const out: string[] = []
  for (let d = gridStart.value; d <= end; d = addDays(d, 1)) out.push(d)
  return out
})

async function load() {
  loading.value = true
  try {
    const from = q.mode === 'calendar' ? gridStart.value : monthStart.value
    const to = q.mode === 'calendar' ? addDays(gridDates.value[gridDates.value.length - 1], 1) : addDays(monthStart.value, monthDays.value)
    const [s, r] = await Promise.all([
      scheduleApi.sessions({ from: toApi(from), to: toApi(to), campusId: q.campusId, roomId: q.roomId, teacherId: q.teacherId, kind: q.kind || undefined }),
      q.mode === 'room' ? scheduleApi.rooms(q.campusId) : Promise.resolve(rooms.value),
    ])
    list.value = s
    rooms.value = r
  } finally {
    loading.value = false
  }
}
watch(q, () => {
  router.replace({ query: Object.fromEntries(Object.entries(q).filter(([, v]) => v !== null && v !== '')) as Record<string, string> })
  load()
})
onMounted(load)

const byDate = computed(() => {
  const m = new Map<string, SessionItem[]>()
  for (const s of list.value) {
    const d = dateOf(s.startAt)
    m.set(d, [...(m.get(d) ?? []), s])
  }
  return m
})
const byRoomDate = computed(() => {
  const m = new Map<string, SessionItem[]>()
  for (const s of list.value) {
    const k = `${s.roomId ?? 0}|${dateOf(s.startAt)}`
    m.set(k, [...(m.get(k) ?? []), s])
  }
  return m
})
const matrixRooms = computed(() => (q.roomId ? rooms.value.filter((r) => r.id === q.roomId) : rooms.value))

function shiftMonth(n: number) {
  q.month = dayjs(monthStart.value).add(n, 'month').format('YYYY-MM')
}
const MAX_IN_CELL = 4
const expanded = ref<string | null>(null)

// ---------------- 对话框 ----------------
const dlg = ref(false)
const preset = ref<SessionPreset | null>(null)
const drawer = ref(false)
const currentId = ref<number | null>(null)
function create(date: string, roomId?: number | null) {
  if (!canCreate.value) return
  preset.value = { campusId: q.campusId, date, roomId: roomId ?? q.roomId, teacherId: q.teacherId }
  dlg.value = true
}
function open(id: number) {
  currentId.value = id
  drawer.value = true
}
const isWeekend = (d: string) => dayjs(d).isoWeekday() >= 6
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-button-group>
          <el-button icon="ArrowLeft" @click="shiftMonth(-1)" />
          <el-button @click="q.month = today().slice(0, 7)">{{ t('schedule.thisMonth') }}</el-button>
          <el-button icon="ArrowRight" @click="shiftMonth(1)" />
        </el-button-group>
        <el-date-picker v-model="q.month" type="month" value-format="YYYY-MM" :clearable="false" style="width: 130px" />
        <el-radio-group v-model="q.mode">
          <el-radio-button value="calendar">{{ t('schedule.calendar') }}</el-radio-button>
          <el-radio-button value="room">{{ t('schedule.byRoom') }}</el-radio-button>
        </el-radio-group>
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <RoomSelect v-model="q.roomId" :campus-id="q.campusId" :placeholder="t('schedule.allRooms')" />
        <UserSelect v-model="q.teacherId" identity="TEACHER" :placeholder="t('schedule.allTeachers')" />
        <el-select v-model="q.kind" :placeholder="t('schedule.allTypes')" clearable>
          <el-option value="CLASS" :label="t('schedule.groupClass')" /><el-option value="VIP" label="VIP" /><el-option
            value="OTHER"
            :label="t('schedule.otherBooking')"
          />
        </el-select>
      </div>
      <div class="summary">
        <b>{{ t('schedule.monthHeading', { year: q.month.slice(0, 4), month: q.month.slice(5) }) }}</b>
        <span class="muted">{{ t('schedule.totalSessions', { p0: list.length }) }}</span>
        <span class="spacer" />
        <KindLegend />
      </div>

      <!-- ============ 月历 ============ -->
      <template v-if="q.mode === 'calendar'">
        <div v-if="isMobile" v-loading="loading">
          <template v-for="d in monthDates" :key="d">
            <div v-if="(byDate.get(d) ?? []).length" class="m-day">
              <div class="m-day-head" :class="{ today: d === today() }">{{ d.slice(5) }} {{ weekdayLabel(dayjs(d).isoWeekday()) }}</div>
              <div v-for="s in byDate.get(d)" :key="s.id" class="item" :class="s.status" :style="kindStyle(s.kind)" @click="open(s.id)">
                <span class="t">{{ fmtTime(s.startAt) }}</span><span class="r">{{ s.room?.name }}</span><span class="n">{{ s.title }}</span>
              </div>
            </div>
          </template>
          <el-empty v-if="!list.length" :description="t('schedule.noSessionsThisMonth')" />
        </div>
        <div v-else v-loading="loading" class="cal">
          <div v-for="w in 7" :key="w" class="cal-wd">{{ weekdayLabel(w) }}</div>
          <div
            v-for="d in gridDates"
            :key="d"
            class="cal-cell"
            :class="{ other: !d.startsWith(q.month), today: d === today(), weekend: isWeekend(d), creatable: canCreate }"
            @click.self="create(d)"
          >
            <div class="cal-date" @click="create(d)">{{ Number(d.slice(8)) }}</div>
            <div
              v-for="s in (byDate.get(d) ?? []).slice(0, expanded === d ? undefined : MAX_IN_CELL)"
              :key="s.id"
              class="item"
              :class="s.status"
              :style="kindStyle(s.kind)"
              :title="`${timeRange(s)} ${s.room?.name ?? ''} ${s.title} ${s.teacher?.name ?? ''}`"
              @click="open(s.id)"
            >
              <span class="t">{{ fmtTime(s.startAt) }}</span><span class="r">{{ s.room?.name }}</span><span class="n">{{ s.title }}</span>
            </div>
            <div v-if="(byDate.get(d) ?? []).length > MAX_IN_CELL && expanded !== d" class="more" @click="expanded = d">{{
              t('schedule.moreSessions', { p0: byDate.get(d)!.length - MAX_IN_CELL })
            }}</div>
            <div v-else-if="expanded === d" class="more" @click="expanded = null">{{ t('schedule.collapse') }}</div>
          </div>
        </div>
      </template>

      <!-- ============ 按教室矩阵 ============ -->
      <div v-else v-loading="loading" class="mx-scroll">
        <table class="mx">
          <thead>
            <tr>
              <th class="mx-room">{{ t('schedule.room') }}</th>
              <th v-for="d in monthDates" :key="d" :class="{ today: d === today(), weekend: isWeekend(d) }">
                <div>{{ Number(d.slice(8)) }}</div><div class="wd">{{ weekdayLabel(dayjs(d).isoWeekday(), true) }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in matrixRooms" :key="r.id">
              <td class="mx-room"><b>{{ r.name }}</b><div class="muted">{{ r.building }}</div></td>
              <td
                v-for="d in monthDates"
                :key="d"
                class="mx-cell"
                :class="{ today: d === today(), weekend: isWeekend(d), creatable: canCreate }"
                @click.self="create(d, r.id)"
              >
                <div
                  v-for="s in byRoomDate.get(`${r.id}|${d}`) ?? []"
                  :key="s.id"
                  class="dot"
                  :class="s.status"
                  :style="kindStyle(s.kind)"
                  :title="`${timeRange(s)} ${s.title} ${s.teacher?.name ?? ''}`"
                  @click="open(s.id)"
                >{{ fmtTime(s.startAt) }}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!matrixRooms.length" :description="t('schedule.noRooms')" />
      </div>
    </div>

    <SessionDialog v-model="dlg" :preset="preset" @saved="load" />
    <SessionDrawer v-model="drawer" :session-id="currentId" @changed="load" />
  </div>
</template>

<style scoped>
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 10px; }
.summary .spacer { flex: 1; }
.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--xh-border); border-radius: 10px; overflow: hidden; }
.cal-wd { background: #f7f8fc; text-align: center; padding: 6px; font-size: 13px; font-weight: 600; color: #475569; border-bottom: 1px solid var(--xh-border); }
.cal-cell { min-height: 112px; padding: 4px; border-right: 1px solid #eef0f6; border-bottom: 1px solid #eef0f6; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cal-cell:nth-child(7n) { border-right: none; }
.cal-cell.weekend { background: #fcfcfe; }
.cal-cell.other { background: #f8f9fb; }
.cal-cell.other .cal-date { color: #cbd5e1; }
.cal-cell.today { background: #f5f5ff; }
.cal-cell.today .cal-date { background: var(--xh-primary); color: #fff; }
.cal-cell.creatable { cursor: copy; }
.cal-date { align-self: flex-start; font-size: 12px; font-weight: 600; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.item { display: flex; gap: 4px; align-items: center; font-size: 12px; line-height: 1.5; padding: 0 5px; border-radius: 4px; background: var(--bg); border-left: 2px solid var(--c); cursor: pointer; white-space: nowrap; overflow: hidden; min-width: 0; }
.item:hover { filter: brightness(0.97); }
.item.CONFIRMED { background: color-mix(in srgb, var(--bg) 50%, #fff); }
.item .t { color: var(--c); font-weight: 650; font-variant-numeric: tabular-nums; }
.item .r { color: var(--xh-text-2); }
.item .n { overflow: hidden; text-overflow: ellipsis; }
.more { font-size: 12px; color: var(--xh-primary); cursor: pointer; padding-left: 5px; }
.m-day { background: #fff; border: 1px solid var(--xh-border); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.m-day .item { font-size: 13px; padding: 4px 6px; }
.m-day-head { font-weight: 600; }
.m-day-head.today { color: var(--xh-primary); }
.mx-scroll { contain: inline-size; overflow: auto; max-height: calc(100vh - 250px); border: 1px solid var(--xh-border); border-radius: 10px; }
.mx { border-collapse: separate; border-spacing: 0; }
.mx th, .mx td { border-right: 1px solid #eef0f6; border-bottom: 1px solid #eef0f6; }
.mx thead th { position: sticky; top: 0; z-index: 2; background: #f7f8fc; font-size: 12px; font-weight: 600; color: #475569; min-width: 46px; padding: 4px 2px; }
.mx thead th .wd { font-weight: 400; color: var(--xh-text-2); }
.mx thead th.today { background: var(--xh-primary); color: #fff; }
.mx thead th.today .wd { color: #e0e7ff; }
.mx th.weekend { background: #f1f3f9; }
.mx-room { position: sticky; left: 0; z-index: 1; background: #fff; min-width: 120px; padding: 6px 10px; text-align: left; font-size: 13px; }
.mx thead .mx-room { z-index: 3; background: #f7f8fc; }
.mx-cell { vertical-align: top; padding: 3px; min-width: 46px; height: 44px; }
.mx-cell.weekend { background: #fcfcfe; }
.mx-cell.today { background: #f5f5ff; }
.mx-cell.creatable { cursor: copy; }
.dot { font-size: 11px; font-variant-numeric: tabular-nums; text-align: center; border-radius: 4px; background: var(--bg); color: var(--c); font-weight: 650; margin-bottom: 2px; padding: 1px 2px; cursor: pointer; border-left: 2px solid var(--c); }
.dot.CONFIRMED { background: color-mix(in srgb, var(--bg) 50%, #fff); }
</style>
