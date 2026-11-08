<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 业务日报：查看全员日报，按人 / 日期筛选，点开即标记已读 */
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useIsMobile } from '@/utils/format'
import { fmtDate, fmtDateTime, tz } from '@/utils/time'
import { crmApi, qNum, qStr, type DailyReport } from '../api'
import DailyView from '../components/DailyView.vue'

const { t } = useI18n()

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const f = reactive({ userId: undefined as number | undefined | null, range: null as [string, string] | null, unread: false })
const page = ref(1)
const pageSize = ref(20)
const items = ref<DailyReport[]>([])
const total = ref(0)
const unread = ref(0)
const loading = ref(false)
const current = ref<DailyReport | null>(null)
const open = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await crmApi.dailyAll({
      userId: f.userId,
      from: f.range?.[0],
      to: f.range?.[1],
      unread: f.unread ? 1 : undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    items.value = r.items
    total.value = r.total
    unread.value = r.unread
  } finally {
    loading.value = false
  }
}

watch(
  () => route.query,
  (q) => {
    if (route.name !== 'crm-daily-all') return
    f.userId = qNum(q.userId)
    f.range = q.from && q.to ? [qStr(q.from), qStr(q.to)] : null
    f.unread = q.unread === '1'
    page.value = qNum(q.page) ?? 1
    pageSize.value = qNum(q.pageSize) ?? 20
    load()
  },
  { immediate: true },
)

function syncQuery() {
  const query: Record<string, string> = {}
  if (f.userId) query.userId = String(f.userId)
  if (f.range) Object.assign(query, { from: f.range[0], to: f.range[1] })
  if (f.unread) query.unread = '1'
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.pageSize = String(pageSize.value)
  const same = JSON.stringify(Object.entries(query).sort()) === JSON.stringify(Object.entries(route.query).map(([k, v]) => [k, qStr(v)]).sort())
  if (same) load()
  else router.replace({ query })
}
function search() {
  page.value = 1
  syncQuery()
}
function onPage(p: number) {
  page.value = p
  syncQuery()
}
function onSize(s: number) {
  pageSize.value = s
  page.value = 1
  syncQuery()
}

async function view(d: DailyReport) {
  current.value = d
  open.value = true
  if (!d.readAt && d.userId !== auth.me?.id) {
    await crmApi.readDaily(d.id)
    d.readAt = new Date().toISOString()
    d.readByName = auth.me?.name ?? null
    unread.value = Math.max(0, unread.value - 1)
  }
}

const snippet = (s: string, n = 60) => (s.length > n ? s.slice(0, n) + '…' : s)
const weekday = (d: string) => tz(d).format('ddd')
const rowClass = ({ row }: { row: DailyReport }) => (row.readAt ? '' : 'row-unread')
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <UserSelect v-model="f.userId" :placeholder="t('crm.messages.allStaff')" @change="search" />
        <el-date-picker
          v-model="f.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          :range-separator="t('common.to')"
          :start-placeholder="t('common.startDate')"
          :end-placeholder="t('common.endDate')"
          style="width: 260px"
          @change="search"
        />
        <el-checkbox v-model="f.unread" @change="search">{{ t('crm.messages.unreadOnly') }}</el-checkbox>
        <span class="spacer" />
        <el-badge :value="unread" :hidden="!unread" type="danger">
          <el-tag type="info" effect="plain">{{ t('crm.messages.unreadDailyReports') }}</el-tag>
        </el-badge>
      </div>

      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!items.length && !loading" :description="t('crm.messages.noDailyReports')" />
        <div v-for="d in items" :key="d.id" class="card" :class="{ unread: !d.readAt }" @click="view(d)">
          <div class="card-head">
            <span v-if="!d.readAt" class="dot" />
            <b>{{ d.user?.name }}</b>
            <span class="muted">{{ fmtDate(d.reportDate) }} {{ weekday(d.reportDate) }}</span>
          </div>
          <div class="card-body">{{ snippet(d.works, 80) }}</div>
          <div class="muted">{{ t('crm.messages.dailyCustomerSummary', { v1: d.newCustomers, v2: d.visits }) }}</div>
        </div>
      </div>

      <el-table v-else v-loading="loading" :data="items" row-key="id" :row-class-name="rowClass" @row-click="view">
        <el-table-column :label="t('crm.messages.date')" width="130">
          <template #default="{ row }: any">
            <span v-if="!row.readAt" class="dot" />
            {{ fmtDate(row.reportDate) }} <span class="muted">{{ weekday(row.reportDate) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.staffMember')" width="140">
          <template #default="{ row }: any">
            <div>{{ row.user?.name }}</div>
            <div class="muted">{{ row.user?.campus?.name }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.todayWork')" min-width="260">
          <template #default="{ row }: any">{{ snippet(row.works) }}</template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.newCustomers')" width="90" align="center" prop="newCustomers" />
        <el-table-column :label="t('crm.messages.visits')" width="70" align="center" prop="visits" />
        <el-table-column :label="t('crm.messages.submittedAt')" width="140">
          <template #default="{ row }: any">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }: any">
            <el-tag v-if="row.readAt" size="small" type="info">{{ t('crm.messages.readBy', { v1: row.readByName ?? '' }) }}</el-tag>
            <el-tag v-else size="small" type="danger" effect="plain">{{ t('crm.messages.unread') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="70">
          <template #default="{ row }: any">
            <el-button link type="primary" @click.stop="view(row)">{{ t('common.view') }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('crm.messages.noDailyReports')" :image-size="80" /></template>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'"
          background
          @current-change="onPage"
          @size-change="onSize"
        />
      </div>
    </div>

    <el-drawer
      v-model="open"
      :size="isMobile ? '100%' : '520px'"
      :title="current ? t('crm.messages.staffDailyReportTitle', { v1: current.user?.name, v2: fmtDate(current.reportDate) }) : t('crm.messages.dailyReport')"
      append-to-body
    >
      <template v-if="current">
        <p class="muted" style="margin-top: 0">{{ t('crm.messages.submittedText', { v1: fmtDateTime(current.createdAt) }) }}<template
          v-if="current.updatedAt !== current.createdAt"
        >{{
            t('crm.messages.updatedSuffix', { v1: fmtDateTime(current.updatedAt) })
        }}</template></p>
        <DailyView :report="current" />
        <p v-if="current.readAt" class="muted">{{ t('crm.messages.readByAt', { v1: current.readByName, v2: fmtDateTime(current.readAt) }) }}</p>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--el-color-danger); margin-right: 6px; vertical-align: middle; }
:deep(.row-unread) td { font-weight: 600; }
:deep(.el-table__row) { cursor: pointer; }
.cards { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.card { border: 1px solid var(--xh-border); border-radius: 12px; padding: 12px 14px; background: #fff; box-shadow: var(--xh-shadow); }
.card.unread { border-left: 3px solid var(--el-color-danger); }
.card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.card-body { white-space: pre-wrap; line-height: 1.6; margin-bottom: 4px; }
</style>
