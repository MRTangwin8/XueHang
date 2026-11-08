<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 我的日报：今日（或补写某天）日报表单 + 历史列表 */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance } from 'element-plus'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { dayjs, fmtDate, fmtDateTime, today, tz, TZ } from '@/utils/time'
import { useAuth } from '@/stores/auth'
import { crmApi, qNum, qStr, type DailyReport } from '../api'
import DailyView from '../components/DailyView.vue'

const { t, locale } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const viewWidth = useDialogWidth('640px')
const auth = useAuth()
/** 销售相关栏目（系统统计、新增客户、到访、客户联络）只对有客户权限的人显示；教师等其他岗位只写工作内容 */
const isSales = computed(() => auth.can(['crm.customer.view', 'crm.customer.all', 'crm.pool']))
const worksPlaceholder = computed(() =>
  isSales.value
    ? t('crm.messages.salesWorkPlaceholder')
    : t('crm.messages.teachingWorkPlaceholder'),
)

// ---------------- 表单 ----------------
const date = ref(today())
const formRef = ref<FormInstance>()
const saving = ref(false)
const loadingForm = ref(false)
const current = ref<DailyReport | null>(null)
const stats = ref({ newCustomers: 0, visits: 0, followUps: 0 })
const blank = () => ({ works: '', unfinished: '', contacts: '', newCustomers: 0, visits: 0, issues: '', proposal: '', selfReview: '' })
const form = reactive(blank())

const isToday = computed(() => date.value === today())
const weekday = computed(() =>
  dayjs.tz(date.value, 'YYYY-MM-DD', TZ).locale(locale.value === 'pt' ? 'pt-br' : locale.value.toLowerCase()).format('dddd'),
)
const disabledDate = (d: Date) => {
  const s = dayjs(d).format('YYYY-MM-DD')
  return s > today() || s < tz().subtract(30, 'day').format('YYYY-MM-DD')
}

async function loadForm() {
  loadingForm.value = true
  try {
    const r = await crmApi.dailyToday(date.value)
    current.value = r.report
    stats.value = r.stats
    Object.assign(form, blank())
    if (r.report) {
      const d = r.report
      Object.assign(form, {
        works: d.works, unfinished: d.unfinished ?? '', contacts: d.contacts ?? '', newCustomers: d.newCustomers, visits: d.visits,
        issues: d.issues ?? '', proposal: d.proposal ?? '', selfReview: d.selfReview ?? '',
      })
    } else {
      form.newCustomers = r.stats.newCustomers
      form.visits = r.stats.visits
    }
    formRef.value?.clearValidate()
  } finally {
    loadingForm.value = false
  }
}
watch(date, loadForm, { immediate: true })

function fillStats() {
  form.newCustomers = stats.value.newCustomers
  form.visits = stats.value.visits
}

async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    current.value = await crmApi.saveDaily({ reportDate: date.value, ...form })
    ElMessage.success(isToday.value ? t('crm.messages.todayReportSubmitted') : t('crm.messages.reportSavedForDate', { v1: date.value }))
    loadList()
  } finally {
    saving.value = false
  }
}

// ---------------- 历史 ----------------
const range = ref<[string, string] | null>(null)
const page = ref(1)
const list = ref<DailyReport[]>([])
const total = ref(0)
const loadingList = ref(false)
const viewing = ref<DailyReport | null>(null)
const viewOpen = ref(false)

async function loadList() {
  loadingList.value = true
  try {
    const r = await crmApi.dailyMine({ from: range.value?.[0], to: range.value?.[1], page: page.value, pageSize: 10 })
    list.value = r.items
    total.value = r.total
  } finally {
    loadingList.value = false
  }
}
watch(
  () => route.query,
  (q) => {
    if (route.name !== 'crm-daily') return
    range.value = q.from && q.to ? [qStr(q.from), qStr(q.to)] : null
    page.value = qNum(q.page) ?? 1
    loadList()
  },
  { immediate: true },
)
function syncQuery() {
  const query: Record<string, string> = {}
  if (range.value) Object.assign(query, { from: range.value[0], to: range.value[1] })
  if (page.value > 1) query.page = String(page.value)
  router.replace({ query })
}
function onRange() {
  page.value = 1
  syncQuery()
}
function onPage(p: number) {
  page.value = p
  syncQuery()
}

function view(d: DailyReport) {
  viewing.value = d
  viewOpen.value = true
}
function edit(d: DailyReport) {
  date.value = fmtDate(d.reportDate)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const editable = (d: DailyReport) => fmtDate(d.reportDate) >= tz().subtract(30, 'day').format('YYYY-MM-DD')
const snippet = (s: string) => (s.length > 80 ? s.slice(0, 80) + '…' : s)
</script>

<template>
  <div class="page">
    <div class="layout" :class="{ mobile: isMobile }">
      <!-- 日报表单 -->
      <div v-loading="loadingForm" class="page-card form-card">
        <div class="form-head">
          <h3 class="page-title" style="margin: 0">{{ isToday ? t('crm.messages.todayDailyReport') : t('crm.messages.backdatedDailyReport') }}</h3>
          <span class="muted">{{ weekday }}</span>
          <span class="spacer" />
          <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" :clearable="false" :disabled-date="disabledDate" style="width: 150px" />
        </div>
        <div class="status-row">
          <el-tag v-if="!current" type="warning" size="small">{{ t('crm.messages.notSubmitted') }}</el-tag>
          <template v-else>
            <el-tag type="success" size="small">{{ t('crm.messages.submitted') }}</el-tag>
            <span class="muted">{{ t('crm.messages.updatedText', { v1: fmtDateTime(current.updatedAt) }) }}</span>
            <el-tag v-if="current.readAt" size="small" type="info">{{
                t('crm.messages.readBy', { v1: current.readByName ?? t('crm.messages.supervisor') })
            }}</el-tag>
          </template>
        </div>
        <div v-if="isSales" class="hint">
          <el-icon><DataAnalysis /></el-icon>
          <span>{{ t('crm.messages.systemTotalsTodayNewCustomers') }} <b>{{ stats.newCustomers }}</b>{{ t('crm.messages.visitsSuffix') }} <b>{{
              stats.visits
          }}</b>{{
              t('crm.messages.followUpsSuffix')
          }} <b>{{
              stats.followUps
          }}</b> {{
              t('crm.messages.times')
          }}</span>
          <el-button link type="primary" size="small" @click="fillStats">{{ t('crm.messages.fillIn') }}</el-button>
        </div>

        <el-form ref="formRef" :model="form" label-position="top">
          <el-form-item
            :label="t('crm.messages.todayWork')"
            prop="works"
            :rules="[{ required: true, message: t('crm.messages.todayWorkRequired'), trigger: 'blur' }]"
          >
            <el-input
              v-model="form.works"
              type="textarea"
              class="big-box"
              :autosize="{ minRows: isMobile ? 10 : 14, maxRows: 60 }"
              maxlength="20000"
              show-word-limit
              :placeholder="worksPlaceholder"
            />
          </el-form-item>
          <template v-if="isSales">
            <div class="nums">
              <el-form-item :label="t('crm.messages.newCustomers')">
                <el-input-number v-model="form.newCustomers" :min="0" controls-position="right" />
              </el-form-item>
              <el-form-item :label="t('crm.messages.visitors')"><el-input-number v-model="form.visits" :min="0" controls-position="right" /></el-form-item>
            </div>
            <el-form-item :label="t('crm.messages.customerContactSummary')">
              <el-input
                v-model="form.contacts"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 30 }"
                :placeholder="t('crm.messages.customersContactedAndProgressMade')"
              />
            </el-form-item>
          </template>
          <el-form-item :label="t('crm.messages.unfinishedAndTomorrow')">
            <el-input v-model="form.unfinished" type="textarea" :autosize="{ minRows: 4, maxRows: 30 }" />
          </el-form-item>
          <div class="two">
            <el-form-item :label="t('crm.messages.questions')">
              <el-input v-model="form.issues" type="textarea" :autosize="{ minRows: 4, maxRows: 20 }" />
            </el-form-item>
            <el-form-item :label="t('crm.messages.suggestions')">
              <el-input v-model="form.proposal" type="textarea" :autosize="{ minRows: 4, maxRows: 20 }" />
            </el-form-item>
          </div>
          <el-form-item :label="t('crm.messages.selfAssessment')">
            <el-input v-model="form.selfReview" type="textarea" :autosize="{ minRows: 3, maxRows: 20 }" />
          </el-form-item>
          <div class="foot">
            <span class="muted">{{ t('crm.messages.dailyReportHint') }}</span>
            <el-button type="primary" :loading="saving" icon="Check" @click="save">{{
                current ? t('crm.messages.updateReport') : t('crm.messages.submitReport')
            }}</el-button>
          </div>
        </el-form>
      </div>

      <!-- 历史 -->
      <div class="page-card list-card">
        <h3 class="page-title">{{ t('crm.messages.reportHistory') }}</h3>
        <div class="toolbar">
          <el-date-picker
            v-model="range"
            type="daterange"
            value-format="YYYY-MM-DD"
            :range-separator="t('common.to')"
            :start-placeholder="t('crm.messages.from')"
            :end-placeholder="t('crm.messages.to')"
            style="width: 100%"
            @change="onRange"
          />
        </div>
        <div v-loading="loadingList" class="history">
          <el-empty v-if="!list.length && !loadingList" :description="t('crm.messages.noDailyReports')" :image-size="72" />
          <div v-for="d in list" :key="d.id" class="item" :class="{ active: fmtDate(d.reportDate) === date }">
            <div class="item-head">
              <b>{{ fmtDate(d.reportDate) }}</b>
              <span class="muted">{{ tz(d.reportDate).format('ddd') }}</span>
              <el-tag v-if="d.readAt" size="small" type="info">{{ t('crm.messages.read') }}</el-tag>
              <el-tag v-else size="small" type="warning" effect="plain">{{ t('crm.messages.notYetRead') }}</el-tag>
              <span class="spacer" />
              <el-button link type="primary" size="small" @click="view(d)">{{ t('common.view') }}</el-button>
              <el-button v-if="editable(d)" link type="primary" size="small" @click="edit(d)">{{ t('common.edit') }}</el-button>
            </div>
            <div class="item-body">{{ snippet(d.works) }}</div>
            <div v-if="isSales" class="muted">{{ t('crm.messages.dailyCustomerSummary', { v1: d.newCustomers, v2: d.visits }) }}</div>
          </div>
        </div>
        <div class="pager">
          <el-pagination :current-page="page" :page-size="10" :total="total" layout="total, prev, pager, next" small background @current-change="onPage" />
        </div>
      </div>
    </div>

    <el-dialog
      v-model="viewOpen"
      :title="viewing ? t('crm.messages.dailyReportTitle', { v1: fmtDate(viewing.reportDate) }) : t('crm.messages.dailyReport')"
      :width="viewWidth"
      append-to-body
    >
      <DailyView v-if="viewing" :report="viewing" />
      <p v-if="viewing?.readAt" class="muted">{{
          t('crm.messages.readByAt', { v1: viewing.readByName ?? t('crm.messages.supervisor'), v2: fmtDateTime(viewing.readAt) })
      }}</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; align-items: start; }
.big-box :deep(textarea) { line-height: 1.75; font-size: 14px; padding: 10px 12px; }
.layout.mobile { grid-template-columns: 1fr; }
.form-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.form-head .spacer, .item-head .spacer { flex: 1; }
.status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.hint {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: var(--xh-primary-soft); color: var(--xh-text); border-radius: 10px; padding: 8px 12px; margin-bottom: 14px; font-size: 13px;
}
.hint .el-icon { color: var(--xh-primary); }
.hint b { color: var(--xh-primary); }
.nums, .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.nums :deep(.el-input-number) { width: 100%; }
.foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex-wrap: wrap; }
.history { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.item { border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px 12px; transition: border-color 0.15s; }
.item.active { border-color: var(--xh-primary); background: var(--xh-primary-soft); }
.item-head { display: flex; align-items: center; gap: 6px; }
.item-body { margin: 6px 0 4px; white-space: pre-wrap; line-height: 1.6; color: var(--xh-text); }
@media (max-width: 767px) {
  .nums, .two { grid-template-columns: 1fr; }
}
</style>
