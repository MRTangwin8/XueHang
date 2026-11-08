<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 退费记录（order.refund / order.all），分页 + 合计 */
import { computed, ref } from 'vue'
import DictSelect from '@/components/DictSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { useDict } from '@/stores/dict'
import { money, useIsMobile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import OrderDrawer from '../components/OrderDrawer.vue'
import { ordersApi, type Refund, type Sums } from '../api'
import { useUrlFilters } from '../useUrlFilters'

const { t } = useI18n()

const dict = useDict()
const isMobile = useIsMobile()
const rows = ref<Refund[]>([])
const total = ref(0)
const sums = ref<Sums>({})
const loading = ref(false)
async function load(params: Record<string, unknown>) {
  loading.value = true
  try {
    const r = await ordersApi.refunds(params)
    rows.value = r.items
    total.value = r.total
    sums.value = r.sums
  } finally {
    loading.value = false
  }
}
const uf = useUrlFilters(['q', 'from', 'to', 'method'], ['campusId'], load)
const f = uf.filters
const sumList = computed(() => Object.entries(sums.value))

const drawer = ref(false)
const currentId = ref<number | null>(null)
function open(r: Refund) {
  currentId.value = r.orderId
  drawer.value = true
}
</script>

<template>
  <div class="page">
    <div class="stat-grid">
      <div v-for="[cur, v] in sumList" :key="cur" class="stat">
        <div class="stat-label">{{ t('orders.messages.totalRefunds', { p1: dict.label('currencies', cur) }) }}</div>
        <div class="stat-value" style="color: var(--el-color-danger)">{{ money(v, cur) }}</div>
      </div>
      <div v-if="!sumList.length" class="stat">
        <div class="stat-label">
          {{ t('orders.messages.totalRefunds2') }}
        </div>
        <div class="stat-value">
          {{ money(0) }}
        </div>
      </div>
      <div class="stat"><div class="stat-label">{{ t('orders.messages.transactions') }}</div><div class="stat-value">{{ total }}</div></div>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-input
          v-model="f.q as string"
          :placeholder="t('orders.messages.orderNumberStudentNameStudentId')"
          clearable
          prefix-icon="Search"
          style="width: 220px"
          @keyup.enter="uf.search"
          @clear="uf.search"
        />
        <el-date-picker
          v-model="uf.range.value"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('orders.messages.refundsFrom')"
          :end-placeholder="t('orders.messages.refundsTo')"
          style="width: 240px"
        />
        <DictSelect v-model="f.method as string" dict="paymentMethods" :placeholder="t('orders.messages.refundMethod')" />
        <CampusSelect v-model="f.campusId as number" />
        <el-button type="primary" icon="Search" @click="uf.search">{{ t('common.search') }}</el-button>
        <el-button @click="uf.reset">{{ t('common.reset') }}</el-button>
      </div>
      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!rows.length && !loading" :description="t('orders.messages.noRefundRecords')" />
        <div v-for="r in rows" :key="r.id" class="c-card" @click="open(r)">
          <div class="c-top">
            <b>
              {{ r.order?.student.name }}
            </b>
            <span class="muted">
              {{ r.order?.orderNo }}
            </span>
            <span class="spacer" />
            <b class="text-danger">
              {{ money(r.amount, r.currency) }}
            </b>
          </div>
          <div class="c-line">{{ fmtDate(r.refundedAt) }} · {{ r.method ?? '—' }} · {{ r.operator?.name ?? '—' }}</div>
          <div v-if="r.reason" class="c-line muted">{{ r.reason }}</div>
        </div>
      </div>
      <el-table v-else v-loading="loading" :data="rows" class="click-rows" @row-click="open">
        <el-table-column :label="t('orders.messages.refundDate')" width="100">
          <template #default="{ row }">
            {{ fmtDate(row.refundedAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.orderNumber')" width="140">
          <template #default="{ row }">
            {{ row.order?.orderNo }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.student')" min-width="120">
          <template #default="{ row }">{{ row.order?.student.name }}<div class="muted">{{ row.order?.student.studentNo }}</div></template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.tuitionPackage')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.order?.package?.name }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.amount')" width="120" align="right">
          <template #default="{ row }">
            <b class="text-danger">
              {{ money(row.amount, row.currency) }}
            </b>
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.method')" width="90">
          <template #default="{ row }">{{ dict.label('paymentMethods', row.method) }}</template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('orders.messages.reason')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="t('orders.messages.operator')" width="90"><template #default="{ row }">{{ row.operator?.name }}</template></el-table-column>
        <el-table-column :label="t('common.campus')" width="100"><template #default="{ row }">{{ row.order?.campus?.name }}</template></el-table-column>
        <template #empty><el-empty :description="t('orders.messages.noRefundRecords')" /></template>
      </el-table>
      <div class="pager">
        <el-pagination
          :current-page="uf.page.value"
          :page-size="uf.pageSize.value"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'"
          background
          @current-change="uf.setPage"
          @size-change="uf.setSize"
        />
      </div>
    </div>
    <OrderDrawer v-model="drawer" :order-id="currentId" @changed="uf.reload" />
  </div>
</template>

<style scoped>
.click-rows :deep(.el-table__row) { cursor: pointer; }
.cards { display: grid; gap: 10px; min-height: 100px; }
.c-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; display: grid; gap: 5px; }
.c-top { display: flex; gap: 8px; align-items: center; }
.c-top .spacer { flex: 1; }
.c-line { font-size: 13px; }
</style>
