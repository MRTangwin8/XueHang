<script setup lang="ts">
/** 学生端首页 · 今日课程：今天的课次（班课 + 一对一）和下一节课 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dayjs, fmtTime, today, toApi } from '@/utils/time'
import { portalApi, type TimetableItem } from '@/modules/schedule/api'
import { addDays, dateOf, kindStyle, timeRange, weekdayLabel } from '@/modules/schedule/utils'

const { t } = useI18n()
const items = ref<TimetableItem[]>([])
const loaded = ref(false)

onMounted(async () => {
  try {
    items.value = await portalApi.timetable(toApi(today()), toApi(addDays(today(), 8)))
  } catch {
    items.value = []
  } finally {
    loaded.value = true
  }
})

const live = computed(() => items.value.filter((s) => s.status !== 'CANCELLED'))
const todayList = computed(() => live.value.filter((s) => dateOf(s.startAt) === today()))
const next = computed(() => live.value.find((s) => new Date(s.endAt).getTime() > Date.now()) ?? null)
const where = (s: TimetableItem) => [s.room?.building, s.room?.name].filter(Boolean).join(' · ')
const nextLabel = (s: TimetableItem) => {
  const d = dateOf(s.startAt)
  const day = d === today() ? t('common.today') : d === addDays(today(), 1) ? t('schedule.tomorrow') : `${d.slice(5)} ${weekdayLabel(dayjs(d).isoWeekday())}`
  return `${day} ${fmtTime(s.startAt)}`
}
</script>

<template>
  <section class="page-card">
    <div class="section-head">
      <h3 class="page-title">{{ t('service.text.homeToday') }}</h3>
      <router-link to="/portal/timetable">{{ t('service.text.more') }}</router-link>
    </div>
    <div v-if="todayList.length" class="today-list">
      <div v-for="s in todayList" :key="s.id" class="lesson" :style="kindStyle(s.kind)">
        <b class="time">{{ timeRange(s) }}</b>
        <span class="title">{{ s.title }}</span>
        <span class="meta">{{ [where(s), s.teacher?.name].filter(Boolean).join(' · ') }}</span>
      </div>
    </div>
    <p v-else-if="loaded" class="meta empty">{{ t('service.text.homeNoLessonToday') }}</p>
    <p v-if="loaded && next" class="meta next">
      {{ t('service.text.homeNextLesson') }}：<b>{{ nextLabel(next) }}</b> {{ next.title }}<template v-if="where(next)"> · {{ where(next) }}</template>
    </p>
  </section>
</template>

<style scoped>
.today-list { display: grid; gap: 8px; }
.lesson { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 8px; border-left: 3px solid var(--c); background: var(--bg); }
.time { font-variant-numeric: tabular-nums; color: var(--c); }
.title { font-weight: 600; }
.empty { margin: 4px 0; }
.next { margin: 12px 0 0; }
</style>
