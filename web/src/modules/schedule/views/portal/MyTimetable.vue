<script setup lang="ts">
/**
 * 学生端 · 我的课表：所在班课的课次 + 本人一对一（VIP）课次，周视图 / 月视图。
 * 点击课次查看教室、老师、出勤、课堂记录；已上完的 VIP 课可直接确认课时。
 * 传入 studentId 时是教职工查看某位学员的课表（内容相同，不能确认课时）。可导出当前周 / 月为图片。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import { useDict } from '@/stores/dict'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { dayjs, fmtTime, today, toApi } from '@/utils/time'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import { portalOn } from '@/utils/portal'
import { portalApi, scheduleApi, type TimetableItem } from '../../api'
import { downloadTimetable } from '../../exportTimetable'
import { addDays, dateOf, kindStyle, KIND_LABEL, mondayOf, timeRange, weekdayLabel } from '../../utils'

const props = defineProps<{ studentId?: number; studentName?: string; studentNo?: string }>()
const { t } = useI18n()
const auth = useAuth()
const site = useSite()
const router = useRouter()
const dict = useDict()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('520px')

const VIEW_KEY = 'xh_portal_timetable_view'
const readView = (): 'week' | 'month' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week'
  } catch {
    return 'week'
  }
}
const view = ref<'week' | 'month'>(readView())
const anchor = ref(today())
const selected = ref(today())
const items = ref<TimetableItem[]>([])
const loading = ref(false)

/** 当前视图的日期范围 [start, end) */
const range = computed(() => {
  if (view.value === 'week') {
    const start = mondayOf(anchor.value)
    return { start, end: addDays(start, 7) }
  }
  const first = dayjs(anchor.value).startOf('month').format('YYYY-MM-DD')
  const start = mondayOf(first)
  return { start, end: addDays(start, 42) }
})
const days = computed(() => {
  const n = view.value === 'week' ? 7 : 42
  return Array.from({ length: n }, (_, i) => addDays(range.value.start, i))
})
const monthOf = computed(() => dayjs(anchor.value).format('YYYY-MM'))

async function load() {
  loading.value = true
  try {
    // 往后多取 7 天，用于「下一节」提示
    const from = toApi(range.value.start), to = toApi(addDays(range.value.end, view.value === 'week' ? 7 : 0))
    items.value = props.studentId ? await scheduleApi.studentTimetable(props.studentId, from, to) : await portalApi.timetable(from, to)
  } finally {
    loading.value = false
  }
}
watch(range, load, { immediate: true, deep: true })
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* ignore */
  }
})

const byDay = computed(() => {
  const m = new Map<string, TimetableItem[]>()
  for (const s of items.value) m.set(dateOf(s.startAt), [...(m.get(dateOf(s.startAt)) ?? []), s])
  return m
})
const ofDay = (d: string) => byDay.value.get(d) ?? []
const active = (list: TimetableItem[]) => list.filter((s) => s.status !== 'CANCELLED')

function move(step: number) {
  anchor.value = view.value === 'week' ? addDays(anchor.value, step * 7) : dayjs(anchor.value).add(step, 'month').startOf('month').format('YYYY-MM-DD')
  if (view.value === 'month') selected.value = anchor.value
}
function goToday() {
  anchor.value = today()
  selected.value = today()
}

const label = computed(() => {
  if (view.value === 'month') return monthOf.value
  const end = addDays(range.value.start, 6)
  return `${range.value.start} – ${end.slice(5)}`
})

// ---------- 概览 ----------
const stats = computed(() => {
  const now = Date.now()
  const live = active(items.value)
  const weekStart = mondayOf(today())
  return {
    today: live.filter((s) => dateOf(s.startAt) === today()).length,
    week: live.filter((s) => dateOf(s.startAt) >= weekStart && dateOf(s.startAt) < addDays(weekStart, 7)).length,
    next: live.find((s) => new Date(s.endAt).getTime() > now) ?? null,
  }
})
const nextLabel = (s: TimetableItem) => {
  const d = dateOf(s.startAt)
  const day = d === today() ? t('common.today') : d === addDays(today(), 1) ? t('schedule.tomorrow') : `${d.slice(5)} ${weekdayLabel(dayjs(d).isoWeekday())}`
  return `${day} ${fmtTime(s.startAt)}`
}

// ---------- 详情 ----------
const detail = ref<TimetableItem | null>(null)
const where = (s: TimetableItem) => [s.room?.building, s.room?.name].filter(Boolean).join(' · ')
async function confirm(s: TimetableItem) {
  try {
    await ElMessageBox.confirm(t('schedule.confirmTheLessonOnHasBeenCompleted', { p0: dateOf(s.startAt).slice(5), p1: timeRange(s), p2: s.hours }),
      t('schedule.confirmHours'), { type: 'info', confirmButtonText: t('common.confirmTitle') })
  } catch {
    return
  }
  await portalApi.confirm(s.id)
  ElMessage.success(t('schedule.confirmed'))
  detail.value = null
  load()
}
dict.load()

// ---------- 导出图片 ----------
const exporting = ref(false)
async function exportImage() {
  const r = dict.rules
  const name = props.studentName ?? auth.me?.name ?? ''
  const from = range.value.start, to = addDays(range.value.end, -1)
  const vars: Record<string, string> = { name, studentNo: props.studentNo ?? auth.me?.studentNo ?? '', from, to, site: site.text('siteName') }
  const fill = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
  const title = r?.timetableExportTitle ? fill(r.timetableExportTitle) : t('schedule.exportDefaultTitle', { name })
  exporting.value = true
  try {
    await downloadTimetable({
      title,
      subtitle: view.value === 'month' ? monthOf.value : `${from} – ${to}`,
      footer: r?.timetableExportFooter ? fill(r.timetableExportFooter) : '',
      brand: site.text('siteName'),
      days: days.value,
      weekdayLabels: [1, 2, 3, 4, 5, 6, 7].map((n) => weekdayLabel(n)),
      classLabel: KIND_LABEL.CLASS,
      items: items.value.filter((s) => dateOf(s.startAt) >= range.value.start && dateOf(s.startAt) < range.value.end),
      dateOf,
      timeRange,
      showTeacher: r?.timetableExportShowTeacher !== false,
      showRoom: r?.timetableExportShowRoom !== false,
      cancelledLabel: t('schedule.portalTimetable.cancelled'),
      emptyLabel: '—',
      month: view.value === 'month' ? monthOf.value : undefined,
      fileName: `${title} ${view.value === 'month' ? monthOf.value : from}`,
    })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="page tt">
    <!-- 概览 -->
    <div class="page-card summary">
      <div class="sum-item"><span class="muted">{{ t('schedule.portalTimetable.todayCount') }}</span><b>{{ stats.today }}</b></div>
      <div class="sum-item"><span class="muted">{{ t('schedule.portalTimetable.weekCount') }}</span><b>{{ stats.week }}</b></div>
      <div class="sum-next">
        <span class="muted">{{ t('schedule.portalTimetable.next') }}</span>
        <template v-if="stats.next">
          <b>{{ nextLabel(stats.next) }}</b>
          <span class="next-title" :style="kindStyle(stats.next.kind)">{{ stats.next.title }}</span>
          <span v-if="where(stats.next)" class="muted">{{ where(stats.next) }}</span>
        </template>
        <span v-else class="muted">{{ t('schedule.portalTimetable.noNext') }}</span>
      </div>
    </div>

    <div class="page-card">
      <div class="toolbar tt-bar">
        <el-button-group>
          <el-button icon="ArrowLeft" @click="move(-1)" />
          <el-button @click="goToday">{{ t('common.today') }}</el-button>
          <el-button icon="ArrowRight" @click="move(1)" />
        </el-button-group>
        <b class="range">{{ label }}</b>
        <span class="spacer" />
        <span class="legend">
          <span><i class="dot" :style="kindStyle('CLASS')" /> {{ KIND_LABEL.CLASS }}</span>
          <span><i class="dot" :style="kindStyle('VIP')" /> VIP</span>
        </span>
        <el-button size="small" icon="Picture" :loading="exporting" @click="exportImage">{{ t('schedule.exportImage') }}</el-button>
        <el-radio-group v-model="view" size="small">
          <el-radio-button value="week">{{ t('schedule.portalTimetable.week') }}</el-radio-button>
          <el-radio-button value="month">{{ t('schedule.portalTimetable.month') }}</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 周视图：电脑七列；手机按天列出 -->
      <template v-if="view === 'week'">
        <div v-if="!isMobile" class="week">
          <div v-for="d in days" :key="d" :class="['wcol', d === today() && 'is-today']">
            <div class="wcol-head">
              <span>{{ weekdayLabel(dayjs(d).isoWeekday()) }}</span>
              <b>{{ d.slice(5) }}</b>
            </div>
            <div class="wcol-body">
              <button v-for="s in ofDay(d)" :key="s.id" type="button" :class="['lesson', s.status === 'CANCELLED' && 'cancelled']"
                :style="kindStyle(s.kind)" @click="detail = s">
                <span class="l-time">{{ timeRange(s) }}</span>
                <span class="l-title">{{ s.title }}</span>
                <span class="l-meta">{{ where(s) }}</span>
                <span v-if="s.teacher" class="l-meta">{{ s.teacher.name }}</span>
                <span v-if="s.status === 'CANCELLED'" class="l-tag">{{ t('schedule.portalTimetable.cancelled') }}</span>
              </button>
              <div v-if="!ofDay(d).length" class="empty-day">—</div>
            </div>
          </div>
        </div>
        <div v-else class="mlist">
          <template v-for="d in days" :key="d">
            <div v-if="ofDay(d).length || d === today()" :class="['mday', d === today() && 'is-today']">
              <div class="mday-head">{{ d.slice(5) }} {{ weekdayLabel(dayjs(d).isoWeekday()) }}<span v-if="d === today()" class="today-pill">{{ t('common.today') }}</span></div>
              <button v-for="s in ofDay(d)" :key="s.id" type="button" :class="['lesson', 'row', s.status === 'CANCELLED' && 'cancelled']"
                :style="kindStyle(s.kind)" @click="detail = s">
                <span class="l-time">{{ timeRange(s) }}</span>
                <span class="l-main">
                  <span class="l-title">{{ s.title }}</span>
                  <span class="l-meta">{{ [where(s), s.teacher?.name].filter(Boolean).join(' · ') }}</span>
                </span>
                <span v-if="s.status === 'CANCELLED'" class="l-tag">{{ t('schedule.portalTimetable.cancelled') }}</span>
              </button>
              <div v-if="!ofDay(d).length" class="muted empty-row">{{ t('schedule.portalTimetable.dayEmpty') }}</div>
            </div>
          </template>
          <el-empty v-if="!active(items).length && !loading" :description="t('schedule.portalTimetable.empty')" :image-size="70" />
        </div>
      </template>

      <!-- 月视图 -->
      <template v-else>
        <div class="month">
          <div v-for="n in 7" :key="'h' + n" class="mhead">{{ weekdayLabel(n, true) }}</div>
          <button v-for="d in days" :key="d" type="button"
            :class="['mcell', d.slice(0, 7) !== monthOf && 'other', d === today() && 'is-today', d === selected && 'is-selected']"
            @click="selected = d">
            <span class="mnum">{{ Number(d.slice(8)) }}</span>
            <template v-if="!isMobile">
              <span v-for="s in ofDay(d).slice(0, 3)" :key="s.id" :class="['chip', s.status === 'CANCELLED' && 'cancelled']" :style="kindStyle(s.kind)"
                @click.stop="detail = s">
                {{ fmtTime(s.startAt) }} {{ s.title }}
              </span>
              <span v-if="ofDay(d).length > 3" class="more">{{ t('schedule.portalTimetable.more', { n: ofDay(d).length - 3 }) }}</span>
            </template>
            <span v-else class="dots">
              <i v-for="s in ofDay(d).slice(0, 4)" :key="s.id" class="dot" :style="kindStyle(s.kind)" />
            </span>
          </button>
        </div>
        <div class="day-panel">
          <div class="mday-head">{{ selected }} {{ weekdayLabel(dayjs(selected).isoWeekday()) }}</div>
          <button v-for="s in ofDay(selected)" :key="s.id" type="button" :class="['lesson', 'row', s.status === 'CANCELLED' && 'cancelled']"
            :style="kindStyle(s.kind)" @click="detail = s">
            <span class="l-time">{{ timeRange(s) }}</span>
            <span class="l-main">
              <span class="l-title">{{ s.title }}</span>
              <span class="l-meta">{{ [where(s), s.teacher?.name].filter(Boolean).join(' · ') }}</span>
            </span>
            <span v-if="s.status === 'CANCELLED'" class="l-tag">{{ t('schedule.portalTimetable.cancelled') }}</span>
          </button>
          <div v-if="!ofDay(selected).length" class="muted empty-row">{{ t('schedule.portalTimetable.dayEmpty') }}</div>
        </div>
      </template>
      <p v-if="!props.studentId" class="muted hint">{{ t('schedule.portalTimetable.hint') }}</p>
    </div>

    <!-- 课次详情 -->
    <el-dialog :model-value="!!detail" :title="detail?.title" :width="dlgWidth" @close="detail = null">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item :label="t('schedule.type')">
            <span class="kind-pill" :style="kindStyle(detail.kind)">{{ KIND_LABEL[detail.kind] }}</span>
            <DictTag v-if="detail.kind === 'VIP' || detail.status === 'CANCELLED'" dict="sessionStatuses" :value="detail.status" style="margin-left: 6px" />
          </el-descriptions-item>
          <el-descriptions-item :label="t('schedule.portalTimetable.time')">
            {{ dateOf(detail.startAt) }} {{ weekdayLabel(dayjs(dateOf(detail.startAt)).isoWeekday()) }} · {{ timeRange(detail) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('schedule.room')">{{ where(detail) || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('schedule.teacher')">{{ detail.teacher?.name ?? '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.classGroup" :label="t('schedule.portalTimetable.class')">{{ detail.classGroup.name }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.vipPackage" :label="t('schedule.lessonPackage')">
            {{ detail.vipPackage.name }} · {{ t('schedule.portalTimetable.hours', { n: detail.hours }) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.attendance" :label="t('schedule.portalTimetable.attendance')">
            <DictTag dict="attendanceStatuses" :value="detail.attendance" />
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="detail.record" class="record">
          <h4>{{ t('schedule.portalTimetable.record') }}</h4>
          <p><b>{{ t('schedule.portalTimetable.content') }}</b>{{ detail.record.content }}</p>
          <p v-if="detail.record.homework"><b>{{ t('schedule.portalTimetable.homework') }}</b>{{ detail.record.homework }}</p>
          <p v-if="detail.record.performance"><b>{{ t('schedule.portalTimetable.performance') }}</b>{{ detail.record.performance }}</p>
        </div>
      </template>
      <template #footer>
        <el-button v-if="detail?.kind === 'VIP' && !props.studentId && portalOn('vip')" @click="router.push('/portal/vip')">{{ t('schedule.portalTimetable.goVip') }}</el-button>
        <el-button v-if="detail?.canConfirm" type="primary" @click="confirm(detail!)">{{ t('schedule.confirmHours') }}</el-button>
        <el-button v-else @click="detail = null">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.summary { display: flex; align-items: center; gap: 12px 28px; flex-wrap: wrap; }
.sum-item { display: flex; align-items: baseline; gap: 8px; }
.sum-item b { font-size: 22px; color: var(--xh-primary); }
.sum-next { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; flex: 1; min-width: 240px; }
.next-title { padding: 1px 8px; border-radius: 6px; background: var(--bg); color: var(--c); font-weight: 600; }
.tt-bar { align-items: center; }
.range { font-size: 15px; }
.legend { display: inline-flex; align-items: center; gap: 12px; font-size: 12px; color: var(--xh-text-2); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }

.week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.wcol { border: 1px solid var(--xh-border); border-radius: 10px; min-height: 280px; display: flex; flex-direction: column; background: #fff; }
.wcol.is-today { border-color: var(--xh-primary); box-shadow: 0 0 0 2px var(--xh-primary-soft); }
.wcol-head { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--xh-border); font-size: 13px; color: var(--xh-text-2); }
.is-today .wcol-head { color: var(--xh-primary); }
.wcol-body { padding: 8px; display: grid; gap: 6px; align-content: start; }
.empty-day { text-align: center; color: #cbd5e1; padding-top: 20px; }

.lesson { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-radius: 8px;
  background: var(--bg); border-left: 3px solid var(--c); font-size: 12px; color: var(--xh-text); position: relative; }
.lesson:hover { filter: brightness(0.97); }
.lesson.row { flex-direction: row; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; margin-bottom: 6px; font-size: 13px; }
.l-time { font-weight: 600; color: var(--c); white-space: nowrap; }
.l-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.l-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.l-meta { color: var(--xh-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.l-tag { font-size: 11px; color: var(--el-color-danger); font-weight: 600; }
.lesson.cancelled .l-title, .lesson.cancelled .l-time { text-decoration: line-through; opacity: 0.6; }

.mlist { display: grid; gap: 4px; }
.mday { margin-bottom: 8px; }
.mday-head { font-weight: 600; margin: 4px 0 6px; display: flex; align-items: center; gap: 6px; }
.today-pill { font-size: 11px; padding: 0 6px; border-radius: 8px; background: var(--xh-primary); color: #fff; }
.empty-row { padding: 6px 0 10px; font-size: 13px; }

.month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.mhead { text-align: center; font-size: 12px; color: var(--xh-text-2); padding: 4px 0; }
.mcell { all: unset; box-sizing: border-box; cursor: pointer; min-height: 96px; border: 1px solid var(--xh-border); border-radius: 8px; padding: 4px 5px;
  display: flex; flex-direction: column; gap: 2px; overflow: hidden; background: #fff; }
.mcell.other { background: #f8fafc; color: #94a3b8; }
.mcell.is-today .mnum { background: var(--xh-primary); color: #fff; }
.mcell.is-selected { border-color: var(--xh-primary); box-shadow: 0 0 0 2px var(--xh-primary-soft); }
.mnum { align-self: flex-start; font-size: 12px; font-weight: 600; min-width: 20px; height: 20px; padding: 0 4px; border-radius: 10px; display: inline-flex;
  align-items: center; justify-content: center; }
.chip { font-size: 11px; padding: 1px 5px; border-radius: 4px; background: var(--bg); color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip.cancelled { text-decoration: line-through; opacity: 0.6; }
.more { font-size: 11px; color: var(--xh-text-2); }
.dots { display: flex; gap: 3px; flex-wrap: wrap; justify-content: center; margin-top: 2px; }
.day-panel { margin-top: 14px; }

.kind-pill { padding: 1px 8px; border-radius: 6px; background: var(--bg); color: var(--c); font-weight: 600; font-size: 12px; }
.record { margin-top: 14px; padding: 10px 12px; background: var(--xh-primary-soft); border-radius: 8px; }
.record h4 { margin: 0 0 6px; font-size: 14px; }
.record p { margin: 4px 0; font-size: 13px; white-space: pre-wrap; }
.record b { margin-right: 6px; }
.hint { margin: 12px 0 0; font-size: 12px; }
@media (max-width: 767px) {
  .mcell { min-height: 52px; align-items: center; }
  .mnum { align-self: center; }
  .legend { display: none; }
}
</style>
