<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import { fmtDateTime } from '@/utils/time'
import { money, useIsMobile } from '@/utils/format'
import { printApi, type PrintReq } from '../api'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const q = reactive<any>({
  status: (route.query.status as string) || '',
  from: (route.query.from as string) || '',
  to: (route.query.to as string) || '',
  q: (route.query.q as string) || '',
  page: Number(route.query.page) || 1,
  pageSize: 20
})
const items = ref<PrintReq[]>([])
const total = ref(0)
const sum = ref(0)
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const r = await printApi.list(q)
    items.value = r.items
    total.value = r.total
    sum.value = r.totalFee
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({
    query: {
      ...q,
      status: q.status || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      q: q.q || undefined,
      page: q.page > 1 ? q.page : undefined
    }
  })
  load()
}
async function status(r: PrintReq, s: string) {
  await printApi.setStatus(r.id, s)
  ElMessage.success(tr('service.text.statusUpdated'))
  load()
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.processPrintRequests') }}</h2>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-select v-model="q.status" clearable :placeholder="tr('common.status')">
          <el-option :label="tr('service.text.pendingPrinting')" value="PENDING" />
          <el-option :label="tr('service.text.printed')" value="PRINTED" />
          <el-option :label="tr('service.text.collected')" value="PICKED" />
          <el-option :label="tr('service.text.cancelled')" value="CANCELLED" />
        </el-select>
        <el-date-picker v-model="q.from" type="date" value-format="YYYY-MM-DD" />
        <el-date-picker v-model="q.to" type="date" value-format="YYYY-MM-DD" />
        <el-input v-model="q.q" :placeholder="tr('service.text.studentFileKeyword')" clearable @keyup.enter="q.page=1;sync()" />
        <el-button type="primary" @click="q.page=1;sync()">{{ tr('service.text.filter') }}</el-button>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">{{ tr('service.text.totalAmount') }}</div>
          <div class="stat-value">{{money(sum)}}</div>
        </div>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.student')">
          <template #default="{ row }: any">{{row.student?.name}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.file')" prop="fileName" min-width="180" />
        <el-table-column :label="tr('service.text.mode')" width="90">
          <template #default="{ row }: any">{{row.colorMode==='BW'?tr('service.text.blackAndWhite'):tr('service.text.color')}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.pagesCopies')" width="90">
          <template #default="{ row }: any">{{row.pages}}
            ×
            {{row.copies}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.fee2')" width="100">
          <template #default="{ row }: any">{{money(row.fee)}}</template>
        </el-table-column>
        <el-table-column v-if="!mobile" :label="tr('service.text.submittedAt2')">
          <template #default="{ row }: any">{{fmtDateTime(row.submittedAt)}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.readyForCollection')">
          <template #default="{ row }: any">{{fmtDateTime(row.readyAt)}}</template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="220">
          <template #default="{ row }: any">
            <el-button v-if="row.status==='PENDING'" link type="primary" @click="status(row,'PRINTED')">{{ tr('service.text.printed') }}</el-button>
            <el-button v-if="row.status==='PRINTED'" link type="success" @click="status(row,'PICKED')">{{ tr('service.text.collected') }}</el-button>
            <el-button v-if="row.status==='PENDING'" link type="danger" @click="status(row,'CANCELLED')">{{ tr('common.cancel') }}</el-button>
            <DictTag v-if="row.status!=='PENDING'&&row.status!=='PRINTED'" dict="printStatuses" :value="row.status" />
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total,prev,pager,next"
          @current-change="sync"
        />
      </div>
    </div>
  </div>
</template>
