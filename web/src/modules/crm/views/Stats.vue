<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 报表统计：概览 + 渠道 / 意向 / 来源 / 状态分布（CSS 条形）+ 按日趋势表 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useIsMobile } from '@/utils/format'
import { tz } from '@/utils/time'
import { crmApi, qNum, qStr, type BarRow, type Overview } from '../api'
import BarList from '../components/BarList.vue'
import RangeBar from '../components/RangeBar.vue'

const { t } = useI18n()

const auth = useAuth()
const dict = useDict()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const defRange = (): [string, string] => [tz().startOf('month').format('YYYY-MM-DD'), tz().format('YYYY-MM-DD')]
const range = ref<[string, string]>(defRange())
const campusId = ref<number | null | undefined>()
const data = ref<Overview | null>(null)
const loading = ref(false)
const hideEmpty = ref(true)
const showCampus = computed(() => auth.can('*') || auth.me?.dataScope === 'ALL')

async function load() {
  loading.value = true
  try {
    data.value = await crmApi.overview({ from: range.value[0], to: range.value[1], campusId: campusId.value })
  } finally {
    loading.value = false
  }
}

watch(
  () => route.query,
  (q) => {
    if (route.name !== 'crm-stats') return
    range.value = q.from && q.to ? [qStr(q.from), qStr(q.to)] : defRange()
    campusId.value = qNum(q.campusId)
    load()
  },
  { immediate: true },
)
function onChange() {
  const query: Record<string, string> = { from: range.value[0], to: range.value[1] }
  if (campusId.value) query.campusId = String(campusId.value)
  if (query.from === qStr(route.query.from) && query.to === qStr(route.query.to) && qStr(query.campusId) === qStr(route.query.campusId)) load()
  else router.replace({ query })
}

const INTENT_COLORS: Record<string, string> = {
  A: 'linear-gradient(90deg,#e11d48,#fb7185)',
  B: 'linear-gradient(90deg,#d97706,#fbbf24)',
  C: 'linear-gradient(90deg,#4f46e5,#818cf8)',
  D: 'linear-gradient(90deg,#64748b,#94a3b8)',
}
const STATUS_COLORS: Record<string, string> = {
  NEW: 'linear-gradient(90deg,#4f46e5,#818cf8)',
  FOLLOWING: 'linear-gradient(90deg,#d97706,#fbbf24)',
  SIGNED: 'linear-gradient(90deg,#0d9488,#2dd4bf)',
  LOST: 'linear-gradient(90deg,#64748b,#94a3b8)',
}

const channelRows = computed<BarRow[]>(() =>
  (data.value?.byChannel ?? []).map((c) => ({ label: c.name, value: c.total, sub: c.signed, extra: c.signed ? t('crm.messages.signedText', { v1:
    c.signed }) : undefined })),
)
const intentRows = computed<BarRow[]>(() =>
  (data.value?.byIntent ?? []).map((r) => ({ label: dict.label('intentLevels', r.level), value: r.total, color: INTENT_COLORS[r.level] })),
)
const statusRows = computed<BarRow[]>(() =>
  (data.value?.byStatus ?? []).map((r) => ({ label: dict.label('customerStatuses', r.status), value: r.total, color: STATUS_COLORS[r.status] })),
)
const sourceRows = computed<BarRow[]>(() =>
  (data.value?.bySource ?? []).map((r) => ({ label: r.name, value: r.total, color: 'linear-gradient(90deg,#0d9488,#5eead4)' })),
)

const trend = computed(() => {
  const rows = [...(data.value?.trend ?? [])].reverse()
  return hideEmpty.value ? rows.filter((r) => r.newCustomers || r.followUps || r.visits || r.signed) : rows
})
const trendMax = computed(() => Math.max(1, ...(data.value?.trend ?? []).map((r) => Math.max(r.newCustomers, r.followUps))))
const w = (v: number) => `${(v / trendMax.value) * 100}%`
const weekday = (d: string) => tz(d + 'T00:00:00+09:00').format('ddd')
</script>

<template>
  <div class="page">
    <RangeBar v-model:range="range" v-model:campus-id="campusId" :show-campus="showCampus" class="page-card bar-card" @change="onChange" />

    <div v-loading="loading">
      <template v-if="data">
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.newCustomers') }}</div>
            <div class="stat-value">{{ data.summary.newCustomers }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.followUpFrequency') }}</div>
            <div class="stat-value">{{ data.summary.followUps }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.visitsVisitors') }}</div>
            <div class="stat-value">{{ data.summary.visits }}<small> / {{ data.summary.visitCustomers }}</small></div>
          </div>
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.newCustomersNowSigned') }}</div>
            <div class="stat-value teal">{{ data.summary.signedOfNew }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.contractConversionRate') }}</div>
            <div class="stat-value primary">{{ data.summary.conversionRate }}<small>%</small></div>
            <el-progress :percentage="Math.min(100, data.summary.conversionRate)" :show-text="false" :stroke-width="5" color="#4f46e5" />
          </div>
          <div class="stat">
            <div class="stat-label">{{ t('crm.messages.signedThisPeriodEnrolled') }}</div>
            <div class="stat-value">{{ data.summary.signedInPeriod }}</div>
          </div>
        </div>

        <div class="charts">
          <div class="page-card">
            <h3 class="page-title">{{ t('crm.messages.channelDistribution') }}</h3>
            <BarList :rows="channelRows" :value-label="t('crm.messages.newCustomers')" :sub-label="t('crm.messages.contractSigned')" />
          </div>
          <div class="page-card">
            <h3 class="page-title">{{ t('crm.messages.interestLevelDistribution') }}</h3>
            <BarList :rows="intentRows" />
            <h3 class="page-title sub-title">{{ t('crm.messages.customerStatusDistribution') }}</h3>
            <BarList :rows="statusRows" />
          </div>
          <div class="page-card">
            <h3 class="page-title">{{ t('crm.messages.inquiryMethodDistribution') }}</h3>
            <BarList :rows="sourceRows" />
          </div>
        </div>

        <div class="page-card">
          <div class="trend-head">
            <h3 class="page-title" style="margin: 0">{{ t('crm.messages.dailyTrend') }}</h3>
            <span class="muted">{{ data.from }} ~ {{ data.to }}</span>
            <span class="spacer" />
            <el-checkbox v-model="hideEmpty">{{ t('crm.messages.hideDatesWithNoData') }}</el-checkbox>
          </div>
          <el-table :data="trend" :max-height="520" size="small">
            <el-table-column :label="t('crm.messages.date')" :width="isMobile ? 100 : 130">
              <template #default="{ row }: any">
                {{ row.date.slice(5) }} <span class="muted">{{ weekday(row.date) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.newCustomers')" min-width="140">
              <template #default="{ row }: any">
                <div class="cell-bar"><i :style="{ width: w(row.newCustomers) }" /><span>{{ row.newCustomers }}</span></div>
              </template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.followUps')" min-width="140">
              <template #default="{ row }: any">
                <div class="cell-bar teal"><i :style="{ width: w(row.followUps) }" /><span>{{ row.followUps }}</span></div>
              </template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.visits')" width="70" align="center" prop="visits" />
            <el-table-column :label="t('crm.messages.signed')" width="70" align="center" prop="signed" />
            <template #empty><el-empty :description="t('crm.messages.noDataForThisPeriod')" :image-size="64" /></template>
          </el-table>
          <p class="muted note">{{ t('crm.messages.statisticsExplanation') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bar-card { margin-bottom: 16px; }
.bar-card.toolbar { margin-bottom: 16px; }
.stat-value small { font-size: 14px; font-weight: 500; color: var(--xh-text-2); }
.stat-value.primary { color: var(--xh-primary); }
.stat-value.teal { color: #0d9488; }
.stat :deep(.el-progress) { margin-top: 6px; }
.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 0; }
.sub-title { margin-top: 20px; }
.trend-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.trend-head .spacer { flex: 1; }
.cell-bar { display: flex; align-items: center; gap: 8px; }
.cell-bar i { display: block; height: 8px; min-width: 2px; border-radius: 4px; background: linear-gradient(90deg, var(--xh-primary), #818cf8); max-width: 75%; }
.cell-bar.teal i { background: linear-gradient(90deg, #0d9488, #5eead4); }
.note { margin: 10px 0 0; }
@media (max-width: 767px) {
  .charts { grid-template-columns: 1fr; }
}
</style>
