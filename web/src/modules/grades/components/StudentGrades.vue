<script setup lang="ts">
/**
 * 某学员的校内考试成绩：趋势图 + 明细（学员详情页签 / 学生端「我的成绩」共用）。
 * <StudentGrades :student-id="id" />   或   <StudentGrades portal />
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDict } from '@/stores/dict'
import { useIsMobile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import { passLine } from '@/utils/edu'
import TrendChart from './TrendChart.vue'
import { gradesApi, type HistoryRow } from '../api'

const { t } = useI18n()
const props = defineProps<{ studentId?: number; portal?: boolean }>()
const dict = useDict()
const isMobile = useIsMobile()
const list = ref<HistoryRow[]>([])
const loading = ref(false)
/** 学生端按「业务规则 → 学生端」决定是否显示名次 / 平均分 / 最好得分率；后台始终显示 */
const show = computed(() => ({
  rank: !props.portal || dict.rules?.portalGradeShowRank !== false,
  avg: !props.portal || dict.rules?.portalGradeShowAverage !== false,
  best: !props.portal || dict.rules?.portalGradeShowBest !== false,
}))

onMounted(async () => {
  dict.load()
  loading.value = true
  try {
    list.value = props.portal ? await gradesApi.mine() : await gradesApi.student(props.studentId!)
  } finally {
    loading.value = false
  }
})

const pct = (v: number | null, max: number) => (v == null || !max ? null : Math.round((v / max) * 1000) / 10)
const points = computed(() =>
  list.value.map((r) => ({
    label: fmtDate(r.examDate).slice(5),
    value: r.absent ? null : pct(r.total, r.fullMark),
    avg: show.value.avg ? pct(r.avg, r.fullMark) : null,
    title: `${r.name}：${r.absent ? t('grades.detail.absent') : (r.total ?? '—')} / ${r.fullMark}`,
  })),
)
const recent = computed(() => [...list.value].reverse())
const latest = computed(() => recent.value.find((r) => !r.absent && r.total != null))
const best = computed(() =>
  list.value.filter((r) => !r.absent && r.total != null).reduce<HistoryRow | null>((b, r) => (!b || pct(r.total, r.fullMark)! > pct(b.total, b.fullMark)! ? r : b), null),
)
const low = (r: HistoryRow, key: string) => {
  const s = r.conf.subjects.find((x) => x.key === key)
  const v = r.scores[key]
  return s != null && v != null && v < passLine(s)
}
</script>

<template>
  <div v-loading="loading" class="sg">
    <template v-if="list.length">
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">{{ t('grades.student.count') }}</div><div class="stat-value">{{ list.length }}</div></div>
        <div class="stat">
          <div class="stat-label">{{ t('grades.student.latest') }}</div>
          <div class="stat-value">{{ latest ? `${latest.total} / ${latest.fullMark}` : '—' }}</div>
        </div>
        <div v-if="show.rank" class="stat">
          <div class="stat-label">{{ t('grades.student.latestRank') }}</div>
          <div class="stat-value">{{ latest?.rank ? `${latest.rank} / ${latest.ranked}` : '—' }}</div>
        </div>
        <div v-if="show.best" class="stat">
          <div class="stat-label">{{ t('grades.student.best') }}</div>
          <div class="stat-value">{{ best ? `${pct(best.total, best.fullMark)}%` : '—' }}</div>
        </div>
      </div>
      <TrendChart v-if="list.length > 1" :points="points" class="chart" />
      <div class="hist">
        <div v-for="r in recent" :key="r.assessmentId" class="h-card">
          <div class="h-top">
            <div>
              <b>{{ r.name }}</b>
              <div class="muted small">{{ fmtDate(r.examDate) }} · {{ dict.label('assessmentKinds', r.kind) }}</div>
            </div>
            <span class="spacer" />
            <el-tag v-if="r.absent" type="info" disable-transitions>{{ t('grades.detail.absent') }}</el-tag>
            <div v-else class="h-total">
              <b>{{ r.total ?? '—' }}</b><span class="muted"> / {{ r.fullMark }}</span>
              <div class="muted small">
                <template v-if="show.rank && r.rank">{{ t('grades.student.rankOf', { p1: r.rank, p2: r.ranked }) }}</template>
                <template v-if="show.rank && r.rank && show.avg"> · </template>
                <template v-if="show.avg">{{ t('grades.stats.avg') }} {{ r.avg ?? '—' }}</template>
              </div>
            </div>
          </div>
          <div v-if="!r.absent" class="subs">
            <div v-for="s in r.conf.subjects" :key="s.key" class="sub">
              <span class="muted">{{ s.name }}</span>
              <b :class="low(r, s.key) && 'low'">{{ r.scores[s.key] ?? '—' }}</b>
              <span class="muted small">/ {{ s.max }}<template v-if="show.avg && !isMobile && r.subjectAvg[s.key] != null"> · {{ t('grades.stats.avg') }} {{ r.subjectAvg[s.key] }}</template></span>
            </div>
          </div>
          <div v-if="r.comment" class="comment"><el-icon><ChatLineRound /></el-icon>{{ r.comment }}</div>
        </div>
      </div>
    </template>
    <el-empty v-else-if="!loading" :description="t('grades.student.empty')" :image-size="70" />
  </div>
</template>

<style scoped>
.chart { margin: 8px 0 16px; }
.hist { display: grid; gap: 10px; }
.h-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px 14px; }
.h-top { display: flex; align-items: flex-start; gap: 10px; }
.h-top .spacer { flex: 1; }
.h-total { text-align: right; }
.h-total b { font-size: 20px; color: var(--xh-primary); }
.small { font-size: 12px; }
.subs { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; }
.sub { display: flex; align-items: baseline; gap: 4px; }
.sub b.low { color: var(--el-color-danger); }
.comment { margin-top: 8px; padding: 6px 10px; background: var(--xh-primary-soft); border-radius: 8px; font-size: 13px; display: flex; gap: 6px; align-items: center; }
</style>
