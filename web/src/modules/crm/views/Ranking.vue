<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 业绩排行：按销售统计新增客户、跟进、签约、订单、应收、实收；前三名高亮 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { money, useIsMobile } from '@/utils/format'
import { tz } from '@/utils/time'
import { crmApi, moneyText, qNum, qStr, type Ranking, type RankingRow } from '../api'
import RangeBar from '../components/RangeBar.vue'

const { t } = useI18n()

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const defRange = (): [string, string] => [tz().startOf('month').format('YYYY-MM-DD'), tz().format('YYYY-MM-DD')]
const range = ref<[string, string]>(defRange())
const campusId = ref<number | null | undefined>()
const data = ref<Ranking | null>(null)
const loading = ref(false)
const showCampus = computed(() => auth.can('*') || auth.me?.dataScope === 'ALL')

async function load() {
  loading.value = true
  try {
    data.value = await crmApi.ranking({ from: range.value[0], to: range.value[1], campusId: campusId.value })
  } finally {
    loading.value = false
  }
}
watch(
  () => route.query,
  (q) => {
    if (route.name !== 'crm-ranking') return
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

const m = (r: Record<string, number>) => moneyText(r, money)
const podium = computed(() => (data.value?.items ?? []).slice(0, 3))
const MEDAL = computed(() => [t('crm.messages.firstPlace'), t('crm.messages.secondPlace'), t('crm.messages.thirdPlace')])
const rowClass = ({ row }: { row: RankingRow }) => (row.rank <= 3 ? `top top-${row.rank}` : '')
</script>

<template>
  <div class="page">
    <RangeBar v-model:range="range" v-model:campus-id="campusId" :show-campus="showCampus" class="page-card" @change="onChange" />

    <div v-loading="loading">
      <template v-if="data">
        <!-- 前三名 -->
        <div v-if="podium.length" class="podium">
          <div v-for="r in podium" :key="r.userId" class="pod" :class="`pod-${r.rank}`">
            <div class="pod-medal"><span class="rank" :class="`r${r.rank}`">{{ r.rank }}</span>{{ MEDAL[r.rank - 1] }}</div>
            <div class="pod-name">{{ r.name }}</div>
            <div class="pod-sub">{{ r.campusName ?? '' }}</div>
            <div class="pod-money">{{ m(r.paid) }}</div>
            <div class="pod-sub">{{ t('crm.messages.podiumSummary', { v1: r.signed, v2: r.orders }) }}</div>
          </div>
        </div>

        <div class="page-card">
          <h3 class="page-title">{{ t('crm.messages.leaderboard') }} <span class="muted" style="font-weight: 400">{{ data.from }} ~ {{ data.to }}</span></h3>

          <div v-if="isMobile" class="cards">
            <el-empty v-if="!data.items.length" :description="t('common.noData')" />
            <div v-for="r in data.items" :key="r.userId" class="card" :class="{ top: r.rank <= 3 }">
              <div class="card-head">
                <span class="rank" :class="`r${r.rank}`">{{ r.rank }}</span>
                <b>{{ r.name }}</b>
                <span class="muted">{{ r.campusName }}</span>
              </div>
              <div class="kv">
                <span>{{ t('common.add') }} <b>{{ r.newCustomers }}</b></span>
                <span>{{ t('crm.messages.followUps') }} <b>{{ r.followUps }}</b></span>
                <span>{{ t('crm.messages.signed') }} <b>{{ r.signed }}</b></span>
                <span>{{ t('crm.messages.orders') }} <b>{{ r.orders }}</b></span>
              </div>
              <div class="kv"><span>{{ t('crm.messages.receivableText', { v1: m(r.payable) }) }}</span><span>{{ t('crm.messages.received') }} <b class="paid">{{
                  m(r.paid)
              }}</b></span></div>
            </div>
          </div>

          <el-table
            v-else
            :data="data.items"
            :row-class-name="rowClass"
            show-summary
            :summary-method="() => [
              t('crm.messages.total'), '', String(data!.total.newCustomers), String(data!.total.followUps),
              String(data!.total.signed), '', String(data!.total.orders), m(data!.total.payable), m(data!.total.paid),
            ]"
          >
            <el-table-column :label="t('crm.messages.rank')" width="70" align="center">
              <template #default="{ row }: any">
                <span class="rank" :class="`r${row.rank}`">{{ row.rank }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.salesRepresentative')" min-width="130">
              <template #default="{ row }: any">
                <b>{{ row.name }}</b>
                <div class="muted">{{ row.staffNo }}{{ row.campusName ? ` · ${row.campusName}` : '' }}</div>
              </template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.newCustomers')" prop="newCustomers" width="90" align="center" />
            <el-table-column :label="t('crm.messages.followUpCount')" prop="followUps" width="80" align="center" />
            <el-table-column :label="t('crm.messages.signedCount')" prop="signed" width="80" align="center" />
            <el-table-column :label="t('crm.messages.conversionRate')" width="90" align="center">
              <template #default="{ row }: any">{{ row.newCustomers ? `${row.conversionRate}%` : '—' }}</template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.orderCount')" prop="orders" width="80" align="center" />
            <el-table-column :label="t('crm.messages.totalReceivable')" min-width="130" align="right">
              <template #default="{ row }: any">{{ m(row.payable) }}</template>
            </el-table-column>
            <el-table-column :label="t('crm.messages.totalReceived')" min-width="130" align="right">
              <template #default="{ row }: any"><b class="paid">{{ m(row.paid) }}</b></template>
            </el-table-column>
            <template #empty><el-empty :description="t('common.noData')" :image-size="64" /></template>
          </el-table>
          <p class="muted note">{{ t('crm.messages.rankingExplanation') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.podium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
.pod {
  border-radius: var(--xh-radius); padding: 16px; text-align: center; border: 1px solid var(--xh-border);
  background: var(--xh-card); box-shadow: var(--xh-shadow);
}
.pod-1 { background: linear-gradient(160deg, #fff7d6, #fff 70%); border-color: #f5d97a; }
.pod-2 { background: linear-gradient(160deg, #eef2f7, #fff 70%); border-color: #d5dbe5; }
.pod-3 { background: linear-gradient(160deg, #fdeee3, #fff 70%); border-color: #efc9ad; }
.pod-medal { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--xh-text-2); }
.pod-name { font-size: 17px; font-weight: 700; margin-top: 6px; }
.pod-money { font-size: 20px; font-weight: 700; color: var(--xh-primary); margin-top: 8px; }
.pod-sub { color: var(--xh-text-2); font-size: 12px; margin-top: 2px; }
.rank {
  display: inline-flex; width: 26px; height: 26px; border-radius: 50%; align-items: center; justify-content: center;
  font-weight: 700; font-size: 13px; background: #f1f3f9; color: var(--xh-text-2);
}
.rank.r1 { background: #f59e0b; color: #fff; }
.rank.r2 { background: #94a3b8; color: #fff; }
.rank.r3 { background: #c2410c; color: #fff; }
:deep(.top-1) td { background: #fffbeb !important; }
:deep(.top-2) td { background: #f8fafc !important; }
:deep(.top-3) td { background: #fff7ed !important; }
.paid { color: var(--xh-primary); }
.note { margin: 10px 0 0; }
.cards { display: flex; flex-direction: column; gap: 10px; }
.card { border: 1px solid var(--xh-border); border-radius: 12px; padding: 12px 14px; }
.card.top { border-color: #f5d97a; background: #fffdf3; }
.card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.kv { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--xh-text-2); margin-top: 2px; }
.kv b { color: var(--xh-text); }
@media (max-width: 767px) {
  .podium { grid-template-columns: 1fr; gap: 10px; }
}
</style>
