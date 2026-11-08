<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教师中心 · 我的课表：待处理（已上未确认 / 未填课堂记录）+ 未来 14 天课次 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import { useAuth } from '@/stores/auth'
import { dayjs, today, toApi } from '@/utils/time'
import { scheduleApi, type SessionItem } from '../api'
import { weekdayLabel, addDays, dateOf, kindStyle, KIND_LABEL, timeRange } from '../utils'
import SessionDrawer from '../components/SessionDrawer.vue'

const { t } = useI18n()

const auth = useAuth()
const list = ref<SessionItem[]>([])
const loading = ref(false)
const PAST_DAYS = 14

async function load() {
  loading.value = true
  try {
    list.value = await scheduleApi.sessions({ from: toApi(addDays(today(), -PAST_DAYS)), to: toApi(addDays(today(), 15)), teacherId: auth.me!.id })
  } finally {
    loading.value = false
  }
}
onMounted(load)

const now = () => Date.now()
const todo = computed(() =>
  list.value
    .filter((s) => new Date(s.startAt).getTime() <= now() && (s.status === 'SCHEDULED' || (!s.hasRecord && s.kind !== 'OTHER')))
    .sort((a, b) => b.startAt.localeCompare(a.startAt)),
)
const upcoming = computed(() => {
  const m = new Map<string, SessionItem[]>()
  for (const s of list.value.filter((s) => new Date(s.endAt).getTime() > now())) {
    const d = dateOf(s.startAt)
    m.set(d, [...(m.get(d) ?? []), s])
  }
  return [...m.entries()]
})
const stats = computed(() => ({
  today: list.value.filter((s) => dateOf(s.startAt) === today()).length,
  week: list.value.filter((s) => new Date(s.startAt).getTime() > now() && dateOf(s.startAt) < addDays(today(), 7)).length,
  unconfirmed: todo.value.filter((s) => s.status === 'SCHEDULED').length,
  noRecord: todo.value.filter((s) => !s.hasRecord).length,
}))

async function confirm(s: SessionItem) {
  try {
    await ElMessageBox.confirm(t('schedule.confirmHasBeenCompleted', { p0: s.title, p1: timeRange(s) }), t('schedule.confirmSession'), { type: 'info' })
  } catch {
    return
  }
  await scheduleApi.confirm(s.id)
  ElMessage.success(t('schedule.confirmed'))
  load()
}
const drawer = ref(false)
const currentId = ref<number | null>(null)
function open(id: number) {
  currentId.value = id
  drawer.value = true
}
const dayLabel = (d: string) => (d === today() ? t('common.today') : d === addDays(today(), 1) ? t('schedule.tomorrow') : weekdayLabel(dayjs(d).isoWeekday()))
</script>

<template>
  <div class="page">
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">{{ t('schedule.todaySSessions') }}</div><div class="stat-value">{{ stats.today }}</div></div>
      <div class="stat"><div class="stat-label">{{ t('schedule.next7Days') }}</div><div class="stat-value">{{ stats.week }}</div></div>
      <div class="stat"><div class="stat-label">{{ t('schedule.pendingConfirmation') }}</div><div
        class="stat-value"
        :class="{ 'text-danger': stats.unconfirmed }"
      >{{ stats.unconfirmed }}</div></div>
      <div class="stat"><div class="stat-label">{{ t('schedule.lessonRecordsToComplete') }}</div><div
        class="stat-value"
        :class="{ 'text-danger': stats.noRecord }"
      >{{ stats.noRecord }}</div></div>
    </div>

    <div v-loading="loading" class="page-card">
      <h3 class="page-title">{{ t('schedule.toDo') }} <span class="muted">{{ t('schedule.sessionsHeldInThePastDays', { p0: PAST_DAYS }) }}</span></h3>
      <div v-if="todo.length" class="list">
        <div v-for="s in todo" :key="s.id" class="item" :style="kindStyle(s.kind)" @click="open(s.id)">
          <div class="when"><b>{{ dateOf(s.startAt).slice(5) }}</b><span>{{ timeRange(s) }}</span></div>
          <div class="body">
            <div class="title"><span class="kind">{{ KIND_LABEL[s.kind] }}</span>{{ s.title }}</div>
            <div class="muted">{{ s.room?.name ?? t('schedule.noRoomAssigned') }}<template v-if="s.kind === 'VIP'"> · {{ s.hours }}h</template></div>
          </div>
          <div class="ops" @click.stop>
            <DictTag dict="sessionStatuses" :value="s.status" />
            <el-tag v-if="!s.hasRecord && s.kind !== 'OTHER'" size="small" type="danger" effect="plain" disable-transitions>{{
              t('schedule.recordMissing')
            }}</el-tag>
            <el-button v-if="s.status === 'SCHEDULED' && s.canEdit" size="small" type="primary" @click="confirm(s)">{{ t('common.confirmTitle') }}</el-button>
            <el-button v-if="!s.hasRecord && s.kind !== 'OTHER'" size="small" @click="open(s.id)">{{ t('schedule.writeRecord') }}</el-button>
          </div>
        </div>
      </div>
      <el-empty v-else :description="t('schedule.noSessionsToProcess')" :image-size="70" />
    </div>

    <div v-loading="loading" class="page-card">
      <h3 class="page-title">{{ t('schedule.next14Days') }}</h3>
      <template v-if="upcoming.length">
        <div v-for="[d, items] in upcoming" :key="d" class="day">
          <div class="day-head" :class="{ today: d === today() }">{{ d.slice(5) }} <span>{{ dayLabel(d) }}</span>
          <span class="muted">{{ t('schedule.sessionCount', { p0: items.length }) }}</span>
          </div>
          <div class="list">
            <div v-for="s in items" :key="s.id" class="item" :style="kindStyle(s.kind)" @click="open(s.id)">
              <div class="when"><span>{{ timeRange(s) }}</span></div>
              <div class="body">
                <div class="title"><span class="kind">{{ KIND_LABEL[s.kind] }}</span>{{ s.title }}</div>
                <div class="muted">{{ s.room?.name ?? t('schedule.noRoomAssigned') }}<template v-if="s.vipPackage"> · {{ s.vipPackage.student.name }}</template>
                </div>
              </div>
              <div class="ops"><DictTag dict="sessionStatuses" :value="s.status" /></div>
            </div>
          </div>
        </div>
      </template>
      <el-empty v-else :description="t('schedule.noSessionsInTheNext14Days')" :image-size="70" />
    </div>

    <SessionDrawer v-model="drawer" :session-id="currentId" @changed="load" />
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--xh-border); border-left: 4px solid var(--c); cursor: pointer; transition: box-shadow 0.15s; }
.item:hover { box-shadow: var(--xh-shadow); }
.when { display: flex; flex-direction: column; min-width: 92px; font-variant-numeric: tabular-nums; }
.when span { color: var(--c); font-weight: 650; }
.body { flex: 1; min-width: 0; }
.title { font-weight: 550; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kind { font-size: 11px; color: var(--c); background: var(--bg); padding: 0 6px; border-radius: 4px; flex: none; }
.ops { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
.ops .el-button { margin-left: 0; }
.day + .day { margin-top: 14px; }
.day-head { font-weight: 650; margin-bottom: 8px; display: flex; gap: 8px; align-items: baseline; }
.day-head.today { color: var(--xh-primary); }
@media (max-width: 767px) {
  .item { flex-wrap: wrap; gap: 8px; }
  .when { min-width: 0; flex-direction: row; gap: 8px; }
  .ops { width: 100%; justify-content: flex-start; }
}
</style>
