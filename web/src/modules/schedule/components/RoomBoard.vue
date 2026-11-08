<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 教室 × 时间 网格（核心组件）
 *  - 日视图：行 = 教室（按楼栋分组），列 = 08:00–22:00（30 分钟刻度），课次为绝对定位色块
 *  - 周视图：行 = 教室，列 = 7 天，格内列出课次 chip
 *  - 点空白 → emit('create', 预填教室与时间)；点课次 → emit('open', id)
 *  - 手机：日视图改为按教室分组的卡片列表；周视图改为按日期分组
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIsMobile } from '@/utils/format'
import { useDict } from '@/stores/dict'
import { dayjs, today, tz } from '@/utils/time'
import type { Room, SessionItem, SessionPreset } from '../api'
import { weekdayLabel, addDays, assignLanes, dateOf, hm, kindStyle, minutesOfDay, timeRange } from '../utils'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{ rooms: Room[]; sessions: SessionItem[]; mode: 'day' | 'week'; date: string; canCreate?: boolean; startHour?: number; endHour?: number }>(),
  { canCreate: false, startHour: undefined, endHour: undefined },
)
const emit = defineEmits<{ create: [preset: SessionPreset]; open: [id: number] }>()
const isMobile = useIsMobile()

// ---------------- 尺寸 ----------------
// 看板时间范围：组件参数优先，否则取「业务规则 → 排课看板」
const dict = useDict()
const startHour = computed(() => props.startHour ?? dict.rules?.boardStartHour ?? 8)
const endHour = computed(() => props.endHour ?? dict.rules?.boardEndHour ?? 22)
const START = computed(() => startHour.value * 60)
const END = computed(() => endHour.value * 60)
const SLOTS = computed(() => (END.value - START.value) / 30)
const LABEL_W = 132
const LANE_H = 50
const box = ref<HTMLElement>()
const boxW = ref(1100)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver((e) => (boxW.value = e[0].contentRect.width))
  if (box.value) ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
const slotW = computed(() => Math.max(34, Math.floor((boxW.value - LABEL_W - 18) / SLOTS.value)))
const trackW = computed(() => slotW.value * SLOTS.value)
const px = (min: number) => ((min - START.value) / 30) * slotW.value

// ---------------- 数据分组 ----------------
const NO_ROOM: Room = { id: 0, campusId: 0, get name() { return t('schedule.noRoomAssigned') }, building: null, capacity: 0, kind: 'OTHER',
  allowVip: true, sort: 9999, active: true, note: null }
const roomList = computed(() => (props.sessions.some((s) => !s.roomId) ? [...props.rooms, NO_ROOM] : props.rooms))
const groups = computed(() => {
  const m = new Map<string, Room[]>()
  for (const r of roomList.value) {
    const k = r.id === 0 ? t('schedule.other') : r.building || t('schedule.other')
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return [...m.entries()].map(([name, rooms]) => ({ name, rooms }))
})
const byRoom = computed(() => {
  const m = new Map<number, SessionItem[]>()
  for (const s of props.sessions) {
    const k = s.roomId ?? 0
    m.set(k, [...(m.get(k) ?? []), s])
  }
  return m
})

const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(props.date, i)))

// ---------------- 日视图布局 ----------------
interface Block { s: SessionItem; left: number; width: number; top: number; clippedL: boolean; clippedR: boolean }
const dayRows = computed(() => {
  const out = new Map<number, { blocks: Block[]; height: number }>()
  for (const r of roomList.value) {
    const list = (byRoom.value.get(r.id) ?? []).filter((s) => dateOf(s.startAt) === props.date)
    const { lane, count } = assignLanes(list)
    const blocks = list.map((s) => {
      const a = minutesOfDay(s.startAt)
      const b = dateOf(s.endAt) === props.date ? minutesOfDay(s.endAt) : 24 * 60
      const l = Math.max(a, START.value), rr = Math.min(Math.max(b, l + 15), END.value)
      return { s, left: px(l), width: Math.max(px(rr) - px(l), 18), top: 3 + lane.get(s.id)! * LANE_H, clippedL: a < START.value, clippedR: b > END.value }
    })
    out.set(r.id, { blocks, height: Math.max(56, count * LANE_H + 6) })
  }
  return out
})
const hours = computed(() => Array.from({ length: endHour.value - startHour.value }, (_, i) => startHour.value + i))

const isToday = computed(() => props.date === today())
const nowLeft = ref<number | null>(null)
function tick() {
  const n = tz()
  const m = n.hour() * 60 + n.minute()
  nowLeft.value = m >= START.value && m <= END.value ? px(m) : null
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tick()
  timer = setInterval(tick, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

function createAt(room: Room, date: string, startMin?: number) {
  if (!props.canCreate) return
  const s = startMin ?? 10 * 60
  emit('create', {
    roomId: room.id || null, campusId: room.id ? room.campusId : null, date,
    startTime: hm(s), endTime: hm(Math.min(s + 60, 23 * 60)),
    kind: room.kind === 'VIP' ? 'VIP' : undefined,
  })
}
function onTrackClick(room: Room, e: MouseEvent) {
  const x = e.offsetX
  const slot = Math.floor(x / slotW.value)
  createAt(room, props.date, START.value + slot * 30)
}

const isPast = (s: SessionItem) => new Date(s.endAt).getTime() < Date.now()
const dayCount = (d: string) => props.sessions.filter((s) => dateOf(s.startAt) === d).length
const daySessions = (roomId: number, d: string) => (byRoom.value.get(roomId) ?? []).filter((s) => dateOf(s.startAt) === d)
</script>

<template>
  <div ref="box" class="room-board">
    <!-- ================= 手机：日视图卡片 ================= -->
    <template v-if="isMobile && mode === 'day'">
      <template v-for="g in groups" :key="g.name">
        <div class="m-group">{{ g.name }}</div>
        <div v-for="r in g.rooms" :key="r.id" class="m-room">
          <div class="m-room-head">
            <b>{{ r.name }}</b>
            <span class="muted">{{
              (dayRows.get(r.id)?.blocks.length ?? 0) ? t('schedule.sessionCount', { p0: dayRows.get(r.id)!.blocks.length }) : t('schedule.available')
            }}</span>
            <span class="spacer" />
            <el-button v-if="canCreate" size="small" text type="primary" icon="Plus" @click="createAt(r, date)">{{ t('schedule.book') }}</el-button>
          </div>
          <div
            v-for="b in dayRows.get(r.id)?.blocks ?? []"
            :key="b.s.id"
            class="m-item"
            :class="[b.s.status, { past: isPast(b.s) }]"
            :style="kindStyle(b.s.kind)"
            @click="emit('open', b.s.id)"
          >
            <span class="t">{{ timeRange(b.s) }}</span>
            <span class="n">{{ b.s.title }}</span>
            <span class="muted">{{ b.s.teacher?.name }}</span>
            <el-icon v-if="b.s.status === 'CONFIRMED'" class="ok"><CircleCheckFilled /></el-icon>
          </div>
        </div>
      </template>
      <el-empty v-if="!roomList.length" :description="t('schedule.noRoomsAtThisCampus')" />
    </template>

    <!-- ================= 手机：周视图按日期 ================= -->
    <template v-else-if="isMobile">
      <div v-for="d in weekDays" :key="d" class="m-room">
        <div class="m-room-head" :class="{ today: d === today() }">
          <b>{{ d.slice(5) }} {{ weekdayLabel(dayjs(d).isoWeekday()) }}</b>
          <span class="muted">{{ t('schedule.sessionCount', { p0: dayCount(d) }) }}</span>
        </div>
        <template v-for="r in roomList" :key="r.id">
          <div
            v-for="s in daySessions(r.id, d)"
            :key="s.id"
            class="m-item"
            :class="[s.status, { past: isPast(s) }]"
            :style="kindStyle(s.kind)"
            @click="emit('open', s.id)"
          >
            <span class="t">{{ timeRange(s) }}</span>
            <span class="n">{{ s.title }}</span>
            <span class="muted">{{ r.name }}</span>
          </div>
        </template>
      </div>
    </template>

    <!-- ================= 日视图：教室 × 时间轴 ================= -->
    <div v-else-if="mode === 'day'" class="scroller">
      <div class="grid" :style="{ width: `${LABEL_W + trackW}px`, '--slot': `${slotW}px`, '--label': `${LABEL_W}px` }">
        <div class="head">
          <div class="corner">{{ t('schedule.room') }}</div>
          <div class="ticks" :style="{ width: `${trackW}px` }">
            <span v-for="h in hours" :key="h" class="tick" :style="{ left: `${px(h * 60)}px` }">{{ String(h).padStart(2, '0') }}:00</span>
          </div>
        </div>
        <template v-for="g in groups" :key="g.name">
          <div class="group"><span>{{ g.name }}</span></div>
          <div v-for="r in g.rooms" :key="r.id" class="row" :style="{ height: `${dayRows.get(r.id)?.height ?? 56}px` }">
            <div class="label">
              <b>{{ r.name }}</b>
              <span v-if="r.id" class="muted">{{
                t('schedule.people', { p0: r.capacity, p1: r.kind === 'VIP' ? ' · VIP' : r.kind === 'ONLINE' ? t('schedule.online') : '' })
              }}</span>
            </div>
            <div class="track" :class="{ creatable: canCreate }" :style="{ width: `${trackW}px` }" @click.self="onTrackClick(r, $event)">
              <div
                v-for="b in dayRows.get(r.id)?.blocks ?? []"
                :key="b.s.id"
                class="block"
                :class="[b.s.status, { past: isPast(b.s), cl: b.clippedL, cr: b.clippedR }]"
                :style="{ ...kindStyle(b.s.kind), left: `${b.left}px`, width: `${b.width}px`, top: `${b.top}px`, height: `${LANE_H - 4}px` }"
                :title="`${timeRange(b.s)} ${b.s.title}${b.s.teacher ? ' · ' + b.s.teacher.name : ''}`"
                @click.stop="emit('open', b.s.id)"
              >
                <div class="b-line1">
                <span class="b-time">{{ timeRange(b.s) }}</span>
                <el-icon v-if="b.s.status === 'CONFIRMED'" class="ok">
                <CircleCheckFilled />
                </el-icon>
                </div>
                <div class="b-line2">{{ b.s.title }}<span v-if="b.s.teacher" class="b-teacher"> · {{ b.s.teacher.name }}</span></div>
              </div>
            </div>
          </div>
        </template>
        <div v-if="isToday && nowLeft != null" class="now" :style="{ left: `${LABEL_W + nowLeft}px` }" />
        <el-empty v-if="!roomList.length" :description="t('schedule.noRoomsAtThisCampus')" />
      </div>
    </div>

    <!-- ================= 周视图：教室 × 7 天 ================= -->
    <div v-else class="scroller">
      <table class="week">
        <thead>
          <tr>
            <th class="w-label">{{ t('schedule.room') }}</th>
            <th v-for="d in weekDays" :key="d" :class="{ today: d === today() }">
              <div>{{ weekdayLabel(dayjs(d).isoWeekday()) }}</div>
              <div class="muted">{{ d.slice(5) }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in groups" :key="g.name">
            <tr class="w-group"><td :colspan="8"><span>{{ g.name }}</span></td></tr>
            <tr v-for="r in g.rooms" :key="r.id">
              <td class="w-label"><b>{{ r.name }}</b></td>
              <td v-for="d in weekDays" :key="d" class="w-cell" :class="{ today: d === today(), creatable: canCreate }" @click.self="createAt(r, d)">
                <div
                  v-for="s in daySessions(r.id, d)"
                  :key="s.id"
                  class="chip"
                  :class="[s.status, { past: isPast(s) }]"
                  :style="kindStyle(s.kind)"
                  :title="`${timeRange(s)} ${s.title}${s.teacher ? ' · ' + s.teacher.name : ''}`"
                  @click="emit('open', s.id)"
                >
                  <span class="c-time">{{ timeRange(s) }}</span>
                  <span class="c-title">{{ s.title }}</span>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.room-board { width: 100%; contain: inline-size; }
.scroller { overflow: auto; max-height: calc(100vh - 250px); min-height: 300px; border: 1px solid var(--xh-border); border-radius: 10px; background: #fff; }

/* ---------- 日视图 ---------- */
.grid { position: relative; }
.head { display: flex; position: sticky; top: 0; z-index: 4; background: #f7f8fc; border-bottom: 1px solid var(--xh-border); height: 34px; }
.corner { position: sticky; left: 0; z-index: 5; width: var(--label); flex: none; background: #f7f8fc; display: flex; align-items: center; padding-left: 12px; font-weight: 600; color: #475569; border-right: 1px solid var(--xh-border); }
.ticks { position: relative; flex: none; }
.tick { position: absolute; top: 9px; font-size: 12px; color: var(--xh-text-2); transform: translateX(4px); font-variant-numeric: tabular-nums; }
.group { height: 28px; display: flex; align-items: center; background: var(--xh-primary-soft); border-bottom: 1px solid var(--xh-border); }
.group span { position: sticky; left: 12px; font-size: 12px; font-weight: 650; color: var(--xh-primary); }
.row { display: flex; border-bottom: 1px solid var(--xh-border); }
.label { position: sticky; left: 0; z-index: 3; width: var(--label); flex: none; background: #fff; border-right: 1px solid var(--xh-border); padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.label b { font-weight: 600; font-size: 13px; }
.track {
  position: relative; flex: none;
  background-image:
    repeating-linear-gradient(to right, transparent 0, transparent calc(var(--slot) * 2 - 1px), #e6e9f2 calc(var(--slot) * 2 - 1px), #e6e9f2 calc(var(--slot) * 2)),
    repeating-linear-gradient(to right, transparent 0, transparent calc(var(--slot) - 1px), #f1f3f8 calc(var(--slot) - 1px), #f1f3f8 var(--slot));
}
.track.creatable { cursor: copy; }
.track.creatable:hover { background-color: #fafbff; }
.block {
  position: absolute; border-radius: 7px; padding: 3px 7px; overflow: hidden; cursor: pointer;
  background: var(--bg); border-left: 3px solid var(--c); color: var(--xh-text); font-size: 12px; line-height: 1.35;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); transition: box-shadow 0.15s, transform 0.15s;
}
.block:hover { box-shadow: 0 4px 12px rgba(15, 23, 42, 0.14); z-index: 2; transform: translateY(-1px); }
.block.CONFIRMED { background: color-mix(in srgb, var(--bg) 55%, #fff); }
.block.SCHEDULED.past { border-left-style: dashed; }
.block.cl { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.block.cr { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.b-line1 { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.b-time { color: var(--c); font-weight: 650; font-variant-numeric: tabular-nums; }
.b-line2 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.b-teacher { color: var(--xh-text-2); font-weight: 400; }
.ok { color: var(--xh-teal); }
.now { position: absolute; top: 34px; bottom: 0; width: 2px; background: #ef4444; z-index: 3; pointer-events: none; }
.now::before { content: ''; position: absolute; top: -4px; left: -3px; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }

/* ---------- 周视图 ---------- */
.week { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 980px; table-layout: fixed; }
.week th, .week td { border-bottom: 1px solid var(--xh-border); border-right: 1px solid #f1f3f8; vertical-align: top; }
.week thead th { position: sticky; top: 0; z-index: 3; background: #f7f8fc; padding: 6px 4px; font-weight: 600; font-size: 13px; color: #475569; }
.week thead th.today { color: var(--xh-primary); background: var(--xh-primary-soft); }
.w-label { position: sticky; left: 0; z-index: 2; width: 120px; background: #fff; padding: 8px 10px; text-align: left; font-size: 13px; }
.week thead .w-label { z-index: 4; background: #f7f8fc; }
.w-group td { background: var(--xh-primary-soft); padding: 4px 12px; font-size: 12px; font-weight: 650; color: var(--xh-primary); }
.w-group span { position: sticky; left: 12px; }
.w-cell { padding: 4px; height: 52px; }
.w-cell.today { background: #fafaff; }
.w-cell.creatable { cursor: copy; }
.w-cell.creatable:hover { background: #f5f6ff; }
.chip {
  display: flex; flex-direction: column; padding: 3px 6px; margin-bottom: 3px; border-radius: 6px; cursor: pointer;
  background: var(--bg); border-left: 3px solid var(--c); font-size: 12px; line-height: 1.3; overflow: hidden;
}
.chip:hover { box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12); }
.chip.CONFIRMED { background: color-mix(in srgb, var(--bg) 55%, #fff); }
.chip.SCHEDULED.past { border-left-style: dashed; }
.c-time { color: var(--c); font-weight: 650; font-variant-numeric: tabular-nums; }
.c-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- 手机 ---------- */
.m-group { font-size: 12px; font-weight: 650; color: var(--xh-primary); margin: 12px 2px 6px; }
.m-room { background: #fff; border: 1px solid var(--xh-border); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
.m-room-head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.m-room-head.today b { color: var(--xh-primary); }
.m-room-head .spacer { flex: 1; }
.m-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; margin-top: 6px; border-radius: 8px; background: var(--bg); border-left: 3px solid var(--c); font-size: 13px; }
.m-item .t { color: var(--c); font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.m-item .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-item.CONFIRMED { background: color-mix(in srgb, var(--bg) 55%, #fff); }
.m-item.SCHEDULED.past { border-left-style: dashed; }
</style>
