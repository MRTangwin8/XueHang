<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 缴费明细：order.view 看本人经手；order.all 看全部（按数据范围）。合计 + 导出 Excel */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { money, useIsMobile, downloadFile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import OrderDrawer from '../components/OrderDrawer.vue'
import { ordersApi, cleanParams, type Payment, type Sums } from '../api'
import { useUrlFilters } from '../useUrlFilters'

const { t } = useI18n()

const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()
const canAll = computed(() => auth.can('order.all'))

const rows = ref<Payment[]>([])
const total = ref(0)
const sums = ref<Sums>({})
const loading = ref(false)
async function load(params: Record<string, unknown>) {
  loading.value = true
  try {
    const r = await ordersApi.payments(params)
    rows.value = r.items
    total.value = r.total
    sums.value = r.sums
  } finally {
    loading.value = false
  }
}
const uf = useUrlFilters(['q', 'from', 'to', 'method', 'kind'], ['campusId', 'payeeId'], load)
const f = uf.filters
const sumList = computed(() => Object.entries(sums.value))

const exporting = ref(false)
async function exportXlsx() {
  exporting.value = true
  try {
    const p = cleanParams({ ...f }) as Record<string, string>
    const qs = new URLSearchParams(p).toString()
    await downloadFile(`/api/orders/payments/export${qs ? `?${qs}` : ''}`, t('orders.messages.paymentDetailsXlsx'))
  } catch {
    ElMessage.error(t('orders.messages.exportFailed'))
  } finally {
    exporting.value = false
  }
}

const drawer = ref(false)
const currentId = ref<number | null>(null)
function open(p: Payment) {
  currentId.value = p.orderId
  drawer.value = true
}
</script>

<template>
  <div class="page">
    <div class="stat-grid">
      <div v-for="[cur, v] in sumList" :key="cur" class="stat">
        <div class="stat-label">{{ t('orders.messages.totalPayments', { p1: dict.label('currencies', cur) }) }}</div>
        <div class="stat-value" style="color: var(--xh-primary)">{{ money(v, cur) }}</div>
      </div>
      <div v-if="!sumList.length" class="stat">
        <div class="stat-label">
          {{ t('orders.messages.totalPayments2') }}
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
          :start-placeholder="t('orders.messages.paymentsFrom')"
          :end-placeholder="t('orders.messages.paymentsTo')"
          style="width: 240px"
        />
        <DictSelect v-model="f.method as string" dict="paymentMethods" :placeholder="t('orders.messages.paymentMethod')" />
        <DictSelect v-model="f.kind as string" dict="paymentKinds" :placeholder="t('orders.messages.paymentCategory')" />
        <template v-if="canAll">
          <CampusSelect v-model="f.campusId as number" />
          <UserSelect v-model="f.payeeId as number" :placeholder="t('orders.messages.paymentHandler')" />
        </template>
        <el-button type="primary" icon="Search" @click="uf.search">{{ t('common.search') }}</el-button>
        <el-button @click="uf.reset">{{ t('common.reset') }}</el-button>
        <span class="spacer" />
        <el-button icon="Download" :loading="exporting" @click="exportXlsx">{{ t('orders.messages.exportExcel') }}</el-button>
      </div>
      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!rows.length && !loading" :description="t('orders.messages.noPaymentRecords')" />
        <div v-for="p in rows" :key="p.id" class="c-card" @click="open(p)">
          <div class="c-top">
            <b>
              {{ p.order?.student.name }}
            </b>
            <span class="muted">
              {{ p.order?.orderNo }}
            </span>
            <span class="spacer" />
            <b class="amt">
              {{ money(p.amount, p.currency) }}
            </b>
          </div>
          <div class="c-line">{{ dict.label('paymentKinds', p.kind) }} · {{ dict.label('paymentMethods', p.method) }} · {{ fmtDate(p.paidAt) }}</div>
          <div class="c-line muted">{{ t('orders.messages.handledBy2', { p1: p.payee?.name ?? '—', p2: p.order?.package?.name }) }}</div>
        </div>
      </div>
      <el-table v-else v-loading="loading" :data="rows" class="click-rows" @row-click="open">
        <el-table-column :label="t('orders.messages.paymentDate')" width="100">
          <template #default="{ row }">
            {{ fmtDate(row.paidAt) }}
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
        <el-table-column :label="t('orders.messages.category')" min-width="120">
          <template #default="{ row }">{{ dict.label('paymentKinds', row.kind) }}</template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.method')" width="90">
          <template #default="{ row }">{{ dict.label('paymentMethods', row.method) }}</template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.amount')" width="120" align="right">
          <template #default="{ row }">
            <b>
              {{ money(row.amount, row.currency) }}
            </b>
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.paymentHandler')" width="90"><template #default="{ row }">{{ row.payee?.name }}</template></el-table-column>
        <el-table-column :label="t('common.campus')" width="100"><template #default="{ row }">{{ row.order?.campus?.name }}</template></el-table-column>
        <el-table-column :label="t('orders.messages.receipt')" width="70">
          <template #default="{ row }">
            <el-link v-if="row.receiptUrl" :href="row.receiptUrl" target="_blank" type="primary" :underline="false" @click.stop>{{ t('common.view') }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="note" :label="t('common.remark')" min-width="120" show-overflow-tooltip />
        <template #empty><el-empty :description="t('orders.messages.noPaymentRecords')" /></template>
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
.c-top .amt { color: var(--xh-primary); }
.c-line { font-size: 13px; }
</style>
