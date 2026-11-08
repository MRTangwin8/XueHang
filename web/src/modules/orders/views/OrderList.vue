<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 订单记录：order.view 看本人销售的订单；order.all 看全部（按角色数据范围）。点击行打开详情抽屉。 */
import { computed, ref } from 'vue'
import DictTag from '@/components/DictTag.vue'
import DictSelect from '@/components/DictSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { money, useIsMobile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import OrderDrawer from '../components/OrderDrawer.vue'
import { ordersApi, type OrderRow } from '../api'
import { useUrlFilters } from '../useUrlFilters'

const { t } = useI18n()

const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()
const canAll = computed(() => auth.can('order.all'))

const rows = ref<OrderRow[]>([])
const total = ref(0)
const sums = ref<Record<string, { payable: number; paid: number; refunded: number }>>({})
const loading = ref(false)

async function load(params: Record<string, unknown>) {
  loading.value = true
  try {
    const r = await ordersApi.list({ scope: canAll.value ? (params.scope ?? 'all') : 'mine', ...params })
    rows.value = r.items
    total.value = r.total
    sums.value = r.sums
  } finally {
    loading.value = false
  }
}
const uf = useUrlFilters(['q', 'status', 'from', 'to', 'scope'], ['campusId', 'salesId', 'studentId'], load)
const f = uf.filters

const drawer = ref(false)
const currentId = ref<number | null>(null)
function open(row: OrderRow) {
  currentId.value = row.id
  drawer.value = true
}
const sumList = computed(() => Object.entries(sums.value))
</script>

<template>
  <div class="page">
    <div class="stat-grid">
      <template v-if="sumList.length">
        <template v-for="[cur, v] in sumList" :key="cur">
          <div class="stat">
            <div class="stat-label">
              {{ t('orders.messages.totalDue', { p1: dict.label('currencies', cur) }) }}
            </div>
            <div class="stat-value">
              {{ money(v.payable, cur) }}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">
              {{ t('orders.messages.totalPaid', { p1: dict.label('currencies', cur) }) }}
            </div>
            <div class="stat-value" style="color: var(--el-color-success)">
              {{ money(v.paid, cur) }}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">
              {{ t('orders.messages.outstanding3', { p1: dict.label('currencies', cur) }) }}
            </div>
            <div class="stat-value" style="color: var(--el-color-danger)">
              {{ money(Math.max(v.payable - v.paid, 0), cur) }}
            </div>
          </div>
        </template>
      </template>
      <div v-else class="stat"><div class="stat-label">{{ t('orders.messages.totalDue2') }}</div><div class="stat-value">{{ money(0) }}</div></div>
      <div class="stat"><div class="stat-label">{{ t('orders.messages.orders') }}</div><div class="stat-value">{{ total }}</div></div>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-radio-group v-if="canAll && auth.can('order.view')" v-model="f.scope" @change="uf.search">
          <el-radio-button :value="undefined">{{ t('common.all') }}</el-radio-button>
          <el-radio-button value="mine">{{ t('orders.messages.mySales') }}</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="f.q as string"
          :placeholder="t('orders.messages.orderNumberStudentNameStudentId')"
          clearable
          prefix-icon="Search"
          style="width: 220px"
          @keyup.enter="uf.search"
          @clear="uf.search"
        />
        <DictSelect v-model="f.status as string" dict="orderStatuses" :placeholder="t('orders.messages.orderStatus')" />
        <el-date-picker
          v-model="uf.range.value"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('orders.messages.contractFrom')"
          :end-placeholder="t('orders.messages.contractTo')"
          style="width: 240px"
        />
        <template v-if="canAll">
          <CampusSelect v-model="f.campusId as number" />
          <UserSelect v-model="f.salesId as number" :placeholder="t('orders.messages.sales')" />
        </template>
        <el-button type="primary" icon="Search" @click="uf.search">{{ t('common.search') }}</el-button>
        <el-button @click="uf.reset">{{ t('common.reset') }}</el-button>
      </div>
      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!rows.length && !loading" :description="t('orders.messages.noOrders')" />
        <div v-for="o in rows" :key="o.id" class="o-card" @click="open(o)">
          <div class="o-top">
            <b>
              {{ o.student.name }}
            </b>
            <span class="muted">
              {{ o.orderNo }}
            </span>
            <span class="spacer" />
            <DictTag dict="orderStatuses" :value="o.status" />
          </div>
          <div class="o-line">{{ o.package?.name }} · {{ dict.label('classModes', o.classMode) }}</div>
          <div class="o-line">{{ t('orders.messages.paidDue', { p1: money(o.paidAmount, o.currency), p2: money(o.payableAmount, o.currency) }) }}</div>
          <div class="o-line muted">{{ fmtDate(o.signedAt) }} · {{ o.sales?.name ?? '—' }}</div>
        </div>
      </div>
      <el-table v-else v-loading="loading" :data="rows" class="click-rows" @row-click="open">
        <el-table-column prop="orderNo" :label="t('orders.messages.orderNumber')" width="140" />
        <el-table-column :label="t('orders.messages.student')" min-width="130">
          <template #default="{ row }">{{ row.student.name }}<div class="muted">{{ row.student.studentNo }}</div></template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.tuitionPackage')" min-width="170">
          <template #default="{ row }">
            {{ row.package?.name }}
            <el-tag size="small" effect="plain" :type="row.classMode === 'CLASS' ? 'primary' : 'warning'" disable-transitions>
              {{ dict.label('classModes', row.classMode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.amountDue')" width="110" align="right">
          <template #default="{ row }">
            {{ money(row.payableAmount, row.currency) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.paid')" width="110" align="right">
          <template #default="{ row }">
            {{ money(row.paidAmount, row.currency) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.refunded')" width="100" align="right">
          <template #default="{ row }">
            {{ row.refundedAmount ? money(row.refundedAmount, row.currency) : '' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90">
          <template #default="{ row }">
            <DictTag dict="orderStatuses" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.contractDate')" width="100">
          <template #default="{ row }">
            {{ fmtDate(row.signedAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.sales')" width="90"><template #default="{ row }">{{ row.sales?.name }}</template></el-table-column>
        <el-table-column :label="t('common.campus')" width="100"><template #default="{ row }">{{ row.campus?.name }}</template></el-table-column>
        <template #empty><el-empty :description="t('orders.messages.noOrders')" /></template>
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
.o-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; display: grid; gap: 5px; }
.o-top { display: flex; gap: 8px; align-items: center; }
.o-top .spacer { flex: 1; }
.o-line { font-size: 13px; }
</style>
