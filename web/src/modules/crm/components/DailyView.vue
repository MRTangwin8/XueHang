<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 日报内容展示（只读） */
import type { DailyReport } from '../api'
import { computed } from 'vue'

const { t } = useI18n()

defineProps<{ report: DailyReport }>()
const sections = computed<{ key: keyof DailyReport; label: string }[]>(() => [
  { key: 'works', label: t('crm.messages.todayWork') },
  { key: 'unfinished', label: t('crm.messages.unfinishedTasks') },
  { key: 'contacts', label: t('crm.messages.customerContactSummary') },
  { key: 'issues', label: t('crm.messages.questions') },
  { key: 'proposal', label: t('crm.messages.suggestions') },
  { key: 'selfReview', label: t('crm.messages.selfAssessment') },
])
</script>

<template>
  <div class="daily-view">
    <div v-if="report.newCustomers || report.visits" class="nums">
      <div class="num"><span class="muted">{{ t('crm.messages.newCustomers') }}</span><b>{{ report.newCustomers }}</b></div>
      <div class="num"><span class="muted">{{ t('crm.messages.visits') }}</span><b>{{ report.visits }}</b></div>
    </div>
    <template v-for="s in sections" :key="s.key">
      <div v-if="report[s.key]" class="sec">
        <div class="sec-label">{{ s.label }}</div>
        <div class="sec-body">{{ report[s.key] }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.nums { display: flex; gap: 10px; margin-bottom: 12px; }
.num {
  flex: 1;
  background: var(--xh-primary-soft);
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
 
}
.num b { font-size: 18px; color: var(--xh-primary); }
.sec { margin-bottom: 12px; }
.sec-label { font-weight: 600; font-size: 13px; color: var(--xh-text-2); margin-bottom: 4px; }
.sec-body {
  white-space: pre-wrap;
  line-height: 1.7;
  background: var(--el-fill-color-light);
  border: 1px solid var(--xh-border);
  border-radius: 8px;
  padding: 8px 12px;
 
}
</style>
