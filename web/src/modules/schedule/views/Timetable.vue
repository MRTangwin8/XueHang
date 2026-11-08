<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 课程表：周视图（时间 × 星期），可按校区 / 老师 / 班课 / 教室 / 类型筛选；点课次直接确认或修改 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import RoomSelect from '@/components/RoomSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useIsMobile } from '@/utils/format'
import { dayjs, today, toApi } from '@/utils/time'
import { scheduleApi, type SessionItem, type SessionPreset } from '../api'
import { weekdayLabel, addDays, dateOf, hm, kindStyle, layoutColumns, minutesOfDay, mondayOf, timeRange } from '../utils'
import ClassSelect from '../components/ClassSelect.vue'
import KindLegend from '../components/KindLegend.vue'
import SessionDialog from '../components/SessionDialog.vue'
import SessionDrawer from '../components/SessionDrawer.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMobile = useIsMobile()
const canCreate = computed(() => auth.can(['schedule.edit', 'schedule.own']))
const num = (v: unknown) => (v ? Number(v) : null)

const q = reactive({
  week: mondayOf((route.query.week as string) || today()),
  campusId: route.query.campusId ? Number(route.query.campusId) : auth.me?.campusId ?? null,
  teacherId: num(route.query.teacherId),
  classGroupId: num(route.query.classGroupId),
  roomId: num(route.query.roomId),
  kind: (route.query.kind as string) || '',
})
const list = ref<SessionItem[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    list.value = await scheduleApi.sessions({
      from: toApi(q.week), to: toApi(addDays(q.week, 7)), campusId: q.campusId, teacherId: q.teacherId,
      classGroupId: q.classGroupId, roomId: q.roomId, kind: q.kind || undefined,
    })
  } finally {
    loading.value = false
  }
}
watch(q, () => {
  router.replace({ query: Object.fromEntries(Object.entries(q).filter(([, v]) => v !== null && v !== '')) as Record<string, string> })
  load()
})
onMounted(load)

// ---------------- 网格 ----------------
const START_H = 8, END_H = 22, HOUR_H = 52
const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(q.week, i)))
const byDay = computed(() => {
  const m = new Map<string, SessionItem[]>()
  for (const s of list.value) {
    const d = dateOf(s.startAt)
    m.set(d, [...(m.get(d) ?? []), s])
  }
  return m
})
function blocks(d: string) {
  const items = byDay.value.get(d) ?? []
  const lay = layoutColumns(items)
  return items.map((s) => {
    const a = Math.max(minutesOfDay(s.startAt), START_H * 60)
    const b = Math.min(Math.max(dateOf(s.endAt) === d ? minutesOfDay(s.endAt) : 24 * 60, a + 20), END_H * 60)
    const { lane, lanes } = lay.get(s.id)!
    return { s, top: ((a - START_H * 60) / 60) * HOUR_H, height: Math.max(((b - a) / 60) * HOUR_H - 2, 22), left: (lane / lanes) * 100, width: 100 / lanes }
  })
}

const isPast = (s: SessionItem) => new Date(s.endAt).getTime() < Date.now()
const canQuickConfirm = (s: SessionItem) => s.canEdit && s.status === 'SCHEDULED' && new Date(s.startAt).getTime() <= Date.now()

async function quickConfirm(s: SessionItem) {
  try {
    await ElMessageBox.confirm(t('schedule.quickConfirmPrompt', { p0: s.title, p1: timeRange(s), p2: s.kind === 'VIP' ? t('schedule.hWillBeConfirmed',
      { p0: s.hours }) : '' }), t('schedule.confirmSession'), { type: 'info' })
  } catch {
    return
  }
  await scheduleApi.confirm(s.id)
  ElMessage.success(t('schedule.confirmed'))
  load()
}

// ---------------- 对话框 ----------------
const dlg = ref(false)
const preset = ref<SessionPreset | null>(null)
const drawer = ref(false)
const currentId = ref<number | null>(null)
function onColumnClick(d: string, e: MouseEvent) {
  if (!canCreate.value) return
  const min = START_H * 60 + Math.floor(e.offsetY / (HOUR_H / 2)) * 30
  preset.value = { campusId: q.campusId, date: d, startTime: hm(min), endTime: hm(Math.min(min + 60, 23 * 60)), roomId: q.roomId, teacherId: q.teacherId,
    classGroupId: q.classGroupId, kind: q.classGroupId ? 'CLASS' : undefined }
  dlg.value = true
}
function open(id: number) {
  currentId.value = id
  drawer.value = true
}
const weekLabel = computed(() => `${q.week} ~ ${addDays(q.week, 6).slice(5)}`)
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-button-group>
          <el-button icon="ArrowLeft" @click="q.week = addDays(q.week, -7)" />
          <el-button @click="q.week = mondayOf(today())">{{ t('schedule.thisWeek') }}</el-button>
          <el-button icon="ArrowRight" @click="q.week = addDays(q.week, 7)" />
        </el-button-group>
        <el-date-picker
          :model-value="q.week"
          type="week"
          :format="t('schedule.yyyyWeekWw')"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 160px"
          @update:model-value="(v: string) => (q.week = mondayOf(v))"
        />
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <UserSelect v-model="q.teacherId" identity="TEACHER" :placeholder="t('schedule.allTeachers')" />
        <ClassSelect v-model="q.classGroupId" :campus-id="q.campusId" include-finished class="cls" />
        <RoomSelect v-model="q.roomId" :campus-id="q.campusId" :placeholder="t('schedule.allRooms')" />
        <el-select v-model="q.kind" :placeholder="t('schedule.allTypes')" clearable>
          <el-option value="CLASS" :label="t('schedule.groupClass')" /><el-option value="VIP" label="VIP" /><el-option
            value="OTHER"
            :label="t('schedule.otherBooking')"
          />
        </el-select>
      </div>
      <div class="summary">
        <b>{{ weekLabel }}</b>
        <span class="muted">{{ t('schedule.totalSessions', { p0: list.length }) }}</span>
        <span class="spacer" />
        <KindLegend />
      </div>

      <!-- 手机：按日期列表 -->
      <div v-if="isMobile" v-loading="loading">
        <div v-for="d in days" :key="d" class="m-day">
          <div class="m-day-head" :class="{ today: d === today() }">{{
            d.slice(5)
          }} {{
            weekdayLabel(dayjs(d).isoWeekday())
          }}<span class="muted">{{
            t('schedule.sessionCount', { p0: (byDay.get(d) ?? []).length })
          }}</span>
          </div>
          <div
            v-for="s in byDay.get(d) ?? []"
            :key="s.id"
            class="m-item"
            :class="[s.status, { past: isPast(s) }]"
            :style="kindStyle(s.kind)"
            @click="open(s.id)"
          >
            <span class="t">{{ timeRange(s) }}</span>
            <span class="n">{{ s.title }}<small class="muted"> {{ s.room?.name }} · {{ s.teacher?.name }}</small></span>
            <el-button v-if="canQuickConfirm(s)" size="small" type="primary" plain @click.stop="quickConfirm(s)">{{ t('common.confirmTitle') }}</el-button>
            <el-icon v-else-if="s.status === 'CONFIRMED'" class="ok"><CircleCheckFilled /></el-icon>
          </div>
        </div>
      </div>

      <!-- 桌面：时间 × 星期 -->
      <div v-else v-loading="loading" class="tt-scroll">
        <div class="tt">
          <div class="tt-head">
            <div class="tt-corner" />
            <div v-for="d in days" :key="d" class="tt-day" :class="{ today: d === today() }">
              <b>{{ weekdayLabel(dayjs(d).isoWeekday()) }}</b><span>{{ d.slice(5) }}</span>
            </div>
          </div>
          <div class="tt-body" :style="{ height: `${hours.length * HOUR_H}px` }">
            <div class="tt-times">
              <div v-for="h in hours" :key="h" class="tt-time" :style="{ height: `${HOUR_H}px` }">{{ String(h).padStart(2, '0') }}:00</div>
            </div>
            <div
              v-for="d in days"
              :key="d"
              class="tt-col"
              :class="{ today: d === today(), creatable: canCreate }"
              :style="{ '--hh': `${HOUR_H}px` }"
              @click.self="onColumnClick(d, $event)"
            >
              <div
                v-for="b in blocks(d)"
                :key="b.s.id"
                class="tt-block"
                :class="[b.s.status, { past: isPast(b.s) }]"
                :style="
                  
                  { ...kindStyle(b.s.kind), top: `${b.top}px`, height: `${b.height}px`, left: `calc(${b.left}% +
                  
                    2px)`, width: `calc(${b.width}% - 4px)` }
                
                "
                :title="`${timeRange(b.s)} ${b.s.title} ${b.s.room?.name ?? ''} ${b.s.teacher?.name ?? ''}`"
                @click="open(b.s.id)"
              >
                <div class="bt">{{ timeRange(b.s) }}<el-icon v-if="b.s.status === 'CONFIRMED'" class="ok"><CircleCheckFilled /></el-icon></div>
                <div class="bn">{{ b.s.title }}</div>
                <div class="bm">{{ b.s.room?.name }}<template v-if="b.s.teacher"> · {{ b.s.teacher.name }}</template></div>
                <button v-if="canQuickConfirm(b.s)" class="quick" :title="t('schedule.confirmSession')" @click.stop="quickConfirm(b.s)">
                <el-icon>
                <Select />
                </el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SessionDialog v-model="dlg" :preset="preset" @saved="load" />
    <SessionDrawer v-model="drawer" :session-id="currentId" @changed="load" />
  </div>
</template>

<style scoped>
.toolbar .cls { width: 180px; }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 10px; }
.summary .spacer { flex: 1; }
.tt-scroll { contain: inline-size; overflow: auto; max-height: calc(100vh - 250px); border: 1px solid var(--xh-border); border-radius: 10px; }
.tt { min-width: 900px; }
.tt-head { display: flex; position: sticky; top: 0; z-index: 3; background: #f7f8fc; border-bottom: 1px solid var(--xh-border); }
.tt-corner { width: 56px; flex: none; }
.tt-day { flex: 1; padding: 6px; text-align: center; display: flex; flex-direction: column; font-size: 13px; color: #475569; border-left: 1px solid var(--xh-border); }
.tt-day span { font-size: 12px; color: var(--xh-text-2); }
.tt-day.today { background: var(--xh-primary-soft); color: var(--xh-primary); }
.tt-body { display: flex; position: relative; }
.tt-times { width: 56px; flex: none; }
.tt-time { font-size: 11px; color: var(--xh-text-2); text-align: right; padding-right: 6px; transform: translateY(-7px); font-variant-numeric: tabular-nums; }
.tt-time:first-child { transform: none; }
.tt-col {
  flex: 1; position: relative; border-left: 1px solid var(--xh-border);
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--hh) - 1px), #eef0f6 calc(var(--hh) - 1px), #eef0f6 var(--hh));
}
.tt-col.today { background-color: #fafaff; }
.tt-col.creatable { cursor: copy; }
.tt-block {
  position: absolute; border-radius: 7px; padding: 3px 6px; overflow: hidden; cursor: pointer; font-size: 12px; line-height: 1.35;
  background: var(--bg); border-left: 3px solid var(--c); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.tt-block:hover { box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15); z-index: 2; }
.tt-block.CONFIRMED { background: color-mix(in srgb, var(--bg) 55%, #fff); }
.tt-block.SCHEDULED.past { border-left-style: dashed; }
.bt { color: var(--c); font-weight: 650; display: flex; align-items: center; gap: 3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bn { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bm { color: var(--xh-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ok { color: var(--xh-teal); }
.quick {
  position: absolute; right: 3px; top: 3px; width: 22px; height: 22px; border-radius: 6px; border: none; cursor: pointer;
  background: var(--xh-primary); color: #fff; display: flex; align-items: center; justify-content: center; opacity: 0.85;
}
.quick:hover { opacity: 1; }
.m-day { background: #fff; border: 1px solid var(--xh-border); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
.m-day-head { display: flex; gap: 8px; align-items: center; font-weight: 600; }
.m-day-head.today { color: var(--xh-primary); }
.m-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; margin-top: 6px; border-radius: 8px; background: var(--bg); border-left: 3px solid var(--c); font-size: 13px; }
.m-item .t { color: var(--c); font-weight: 650; white-space: nowrap; font-variant-numeric: tabular-nums; }
.m-item .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-item.SCHEDULED.past { border-left-style: dashed; }
</style>
