<script setup lang="ts">
/** 学生端首页 · 最近一次已发布的成绩（名次是否显示按后台设置） */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDict } from '@/stores/dict'
import { fmtDate } from '@/utils/time'
import { gradesApi, type HistoryRow } from '@/modules/grades/api'

const { t } = useI18n()
const dict = useDict()
const rows = ref<HistoryRow[]>([])
const loaded = ref(false)
onMounted(async () => {
  try {
    rows.value = await gradesApi.mine()
  } catch {
    rows.value = []
  } finally {
    loaded.value = true
  }
})
const latest = computed(() => [...rows.value].reverse().find((r) => !r.absent && r.total != null) ?? null)
const showRank = computed(() => dict.rules?.portalGradeShowRank !== false)
</script>

<template>
  <section class="page-card">
    <div class="section-head">
      <h3 class="page-title">{{ t('service.text.homeLatestGrade') }}</h3>
      <router-link to="/portal/grades">{{ t('service.text.more') }}</router-link>
    </div>
    <div v-if="latest" class="g">
      <div class="score"><b>{{ latest.total }}</b><span class="meta"> / {{ latest.fullMark }}</span></div>
      <div>{{ latest.name }}</div>
      <div class="meta">
        {{ fmtDate(latest.examDate) }}
        <template v-if="showRank && latest.rank"> · {{ t('grades.student.rankOf', { p1: latest.rank, p2: latest.ranked }) }}</template>
      </div>
    </div>
    <p v-else-if="loaded" class="meta empty">{{ t('service.text.homeNoGrades') }}</p>
  </section>
</template>

<style scoped>
.score { font-size: 28px; color: var(--xh-primary); line-height: 1.3; }
.g > div { margin-top: 2px; }
.empty { margin: 4px 0; }
</style>
