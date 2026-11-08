<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { money, useIsMobile, downloadFile } from '@/utils/format'
import { tz } from '@/utils/time'
import { wageApi, wageScopeApi, type WageClaim, type WageSummaryRow } from '../api'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const q = reactive<any>({
  status: (route.query.status as string) || '',
  userId: route.query.userId ? Number(route.query.userId) : null,
  // 默认审核本月；清空后显示全部月份
  month: route.query.month === 'all' ? '' : (route.query.month as string) || tz().format('YYYY-MM'),
  campusId: route.query.campusId ? Number(route.query.campusId) : null,
  page: Number(route.query.page) || 1,
  pageSize: 20
})
const tab = ref('detail')
const items = ref<WageClaim[]>([])
const summary = ref<WageSummaryRow[]>([])
const total = ref(0)
const sum = ref<any>({})
const selected = ref<WageClaim[]>([])
const loading = ref(false)
const sync = () => {
  router.replace({
    query: {
      ...q,
      status: q.status || undefined,
      userId: q.userId || undefined,
      month: q.month || 'all',
      campusId: q.campusId || undefined,
      page: q.page > 1 ? q.page : undefined
    }
  })
  load()
}
/** 只提交有值的筛选条件（空字符串会被后端当作非法月份） */
const params = () => ({
  status: q.status || undefined,
  userId: q.userId || undefined,
  month: q.month || undefined,
  campusId: q.campusId || undefined,
  page: q.page,
  pageSize: q.pageSize,
})
async function load() {
  loading.value = true
  try {
    if (tab.value === 'detail') {
      const r = await wageApi.list(params())
      items.value = r.items
      total.value = r.total
      sum.value = r.summary
    }
    else
      summary.value = (await wageApi.summary({ month: q.month || undefined })).items
  } finally {
    loading.value = false
  }
}
async function review(s: 'APPROVED' | 'REJECTED') {
  if (!selected.value.length)
    return ElMessage.warning(tr('service.text.selectRecordsFirst'))
  const note = await ElMessageBox.prompt(tr('service.text.reviewNotesOptional'), tr('service.text.bulkReview'), { inputType: 'textarea' }).catch(() => null)
  if (note === null)
    return
  await wageApi.review(selected.value.map(x => x.id), s, note.value)
  ElMessage.success(tr('service.text.processed'))
  selected.value = []
  load()
}
function exportX() {
  const month = q.month || tz().format('YYYY-MM')
  downloadFile(`/api/service/wage/export?month=${month}`, tr('service.text.payClaimsXlsx', { v0: month }))
}
/** 当前审核人的审核范围说明 */
const reviewScope = ref<Awaited<ReturnType<typeof wageScopeApi.mine>> | null>(null)
const scopeText = computed(() => {
  const s = reviewScope.value
  if (!s) return ''
  let text = ''
  if (s.effective === 'ALL') text = tr('service.text.allStaff')
  else if (s.effective === 'CAMPUS') text = tr('service.text.staffAtThisCampus')
  else text = [
    s.campuses.length ? tr('service.text.campuses', { v0: s.campuses.map((c) => c.name).join('、') }) : '',
    s.users.length ? tr('service.text.selectedStaff', { v0: s.users.map((u) => u.name).join('、') }) : '',
  ].filter(Boolean).join('；')
  return text + (!s.canReviewOwn ? tr('service.text.excludingYourOwnClaims') : '')
})
onMounted(async () => {
  load()
  reviewScope.value = await wageScopeApi.mine().catch(() => null)
})
</script>

<template>
  <div class="page">
    <div v-if="scopeText" class="muted scope-hint">{{ tr('service.text.myReviewScope') }}{{ scopeText }}</div>
    <div class="page-head">
      <h2>{{ tr('service.text.payClaimManagement') }}</h2>
      <span class="spacer" />
      <el-button @click="exportX">{{ tr('service.text.exportXlsx') }}</el-button>
    </div>
    <div class="page-card">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane :label="tr('service.text.details')" name="detail" />
        <el-tab-pane :label="tr('service.text.byStaffMember')" name="summary" />
      </el-tabs>
      <div class="toolbar">
        <el-select v-model="q.status" clearable :placeholder="tr('common.status')" @change="sync">
          <el-option :label="tr('service.text.pendingReview')" value="PENDING" />
          <el-option :label="tr('service.text.approved')" value="APPROVED" />
          <el-option :label="tr('service.text.rejected')" value="REJECTED" />
        </el-select>
        <UserSelect v-model="q.userId" />
        <el-date-picker v-model="q.month" type="month" value-format="YYYY-MM" @change="sync" />
        <CampusSelect v-model="q.campusId" />
        <el-button type="primary" @click="sync">{{ tr('service.text.filter') }}</el-button>
        <el-button v-if="tab==='detail'" type="success" @click="review('APPROVED')">{{ tr('service.text.approveSelected') }}</el-button>
        <el-button v-if="tab==='detail'" type="danger" @click="review('REJECTED')">{{ tr('service.text.rejectSelected') }}</el-button>
      </div>
      <el-table v-if="tab==='detail'" v-loading="loading" :data="items" @selection-change="selected=$event">
        <el-table-column type="selection" width="45" />
        <el-table-column :label="tr('service.text.staffMember')">
          <template #default="{ row }: any">{{row.user?.name}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.date')" prop="workDate" />
        <el-table-column v-if="!mobile" :label="tr('service.text.category')" prop="category" />
        <el-table-column :label="tr('service.text.hoursWorked')" prop="hours" />
        <el-table-column :label="tr('service.text.total2')">
          <template #default="{ row }: any">{{money(row.amount+row.transportFee)}}</template>
        </el-table-column>
        <el-table-column :label="tr('common.status')">
          <template #default="{ row }: any">
            <DictTag dict="wageStatuses" :value="row.status" />
          </template>
        </el-table-column>
        <template #empty>
          <el-empty />
        </template>
        <template #append>
          <div class="table-total">{{ tr('service.text.total3') }}
            {{money(sum.total||sum.amount)}}</div>
        </template>
      </el-table>
      <el-table v-else :data="summary">
        <el-table-column :label="tr('service.text.staffMember')" prop="name" />
        <el-table-column :label="tr('service.text.claimCount')" prop="count" />
        <el-table-column :label="tr('service.text.hoursWorked')" prop="hours" />
        <el-table-column :label="tr('service.text.total2')">
          <template #default="{ row }: any">{{money(row.total)}}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
