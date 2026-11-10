<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { fmtDate, fmtTime, toApi, tz } from '@/utils/time'
import { hours, wageMoney, useDialogWidth, useIsMobile } from '@/utils/format'
import { wageApi, type WageClaim } from '../api'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const width = useDialogWidth('720px')
const month = ref(String(route.query.month || tz().format('YYYY-MM')))
const items = ref<WageClaim[]>([])
const summary = ref<any>({})
const defaults = ref<any>({})
const loading = ref(false)
const show = ref(false)
const editing = ref<WageClaim | null>(null)
const sessions = ref<any[]>([])
const form = reactive<any>({
  workDate: tz().format('YYYY-MM-DD'),
  start: '',
  end: '',
  category: '',
  hours: 0,
  hourlyRate: null,
  transportFee: null,
  fromStation: '',
  toStation: '',
  content: ''
})
async function load() {
  loading.value = true
  try {
    const r = await wageApi.mine(month.value)
    items.value = r.items
    summary.value = r.summary
    defaults.value = r.defaults
  } catch {
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({ query: { month: month.value } })
  load()
}
function open(c?: WageClaim) {
  editing.value = c || null
  Object.assign(form, c ? {
    workDate: fmtDate(c.workDate),
    start: fmtTime(c.startAt),
    end: fmtTime(c.endAt),
    category: c.category,
    hours: c.hours,
    hourlyRate: c.hourlyRate,
    transportFee: c.transportFee,
    fromStation: c.fromStation || '',
    toStation: c.toStation || '',
    content: c.content
  } : {
    workDate: tz().format('YYYY-MM-DD'),
    start: '',
    end: '',
    category: '',
    hours: 0,
    hourlyRate: defaults.value.hourlyRate,
    transportFee: defaults.value.transportFee,
    fromStation: '',
    toStation: '',
    content: ''
  })
  show.value = true
}
async function save() {
  const body = {
    workDate: toApi(form.workDate),
    startAt: form.start ? toApi(form.workDate, form.start) : undefined,
    endAt: form.end ? toApi(form.workDate, form.end) : undefined,
    category: form.category,
    hours: Number(form.hours),
    hourlyRate: Number(form.hourlyRate),
    transportFee: Number(form.transportFee || 0),
    fromStation: form.fromStation,
    toStation: form.toStation,
    content: form.content
  }
  if (editing.value)
    await wageApi.update(editing.value.id, body)
  else
    await wageApi.create(body)
  ElMessage.success(tr('common.saved'))
  show.value = false
  load()
}
async function remove(c: WageClaim) {
  await ElMessageBox.confirm(tr('service.text.deleteThisPayClaim'), tr('service.text.confirmDeletion'), { type: 'warning' })
  await wageApi.remove(c.id)
  load()
}
async function oneClick() {
  if (!sessions.value.length)
    sessions.value = await wageApi.mySessions(month.value)
  if (!sessions.value.length)
    return ElMessage.info(tr('service.text.noEligibleSessionsToClaim'))
  await wageApi.fromSessions({ sessionIds: sessions.value.map(s => s.id) })
  ElMessage.success(tr('service.text.payClaimsCreatedFromSessions'))
  load()
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.payClaims') }}</h2>
      <span class="spacer" />
      <el-button @click="oneClick">{{ tr('service.text.createClaimsFromSessions') }}</el-button>
      <el-button type="primary" @click="open()">{{ tr('service.text.newPayClaim') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-date-picker v-model="month" type="month" value-format="YYYY-MM" @change="sync" />
        <el-button @click="sync">{{ tr('common.refresh') }}</el-button>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">{{ tr('service.text.claimsTotal') }}</div>
          <div class="stat-value">{{ wageMoney(summary.total||summary.amount) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ tr('service.text.hoursWorked') }}</div>
          <div class="stat-value">{{ hours(summary.hours||0) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ tr('service.text.travelExpenses') }}</div>
          <div class="stat-value">{{ wageMoney(summary.transport) }}</div>
        </div>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.date')" width="110">
          <template #default="{ row }: any">{{fmtDate(row.workDate)}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.category')">
          <template #default="{ row }: any">
            <DictTag dict="wageCategories" :value="row.category" />
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.duration2')" width="90">
          <template #default="{ row }: any">{{hours(row.hours)}}</template>
        </el-table-column>
        <el-table-column v-if="!mobile" :label="tr('service.text.amount')" width="110">
          <template #default="{ row }: any">{{wageMoney(row.amount+row.transportFee)}}</template>
        </el-table-column>
        <el-table-column :label="tr('common.status')" width="100">
          <template #default="{ row }: any">
            <DictTag dict="wageStatuses" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="130">
          <template #default="{ row }: any">
            <template v-if="row.status==='PENDING'">
              <el-button link type="primary" @click="open(row)">{{ tr('common.edit') }}</el-button>
              <el-button link type="danger" @click="remove(row)">{{ tr('common.delete') }}</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="show" :width="width" :title="editing?tr('service.text.editPayClaim'):tr('service.text.newPayClaim')">
      <el-form label-width="90px">
        <el-form-item :label="tr('service.text.workDate')">
          <el-date-picker v-model="form.workDate" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item :label="tr('service.text.startEndTime')">
          <el-time-picker v-model="form.start" format="HH:mm" value-format="HH:mm" />
          <span>-</span>
          <el-time-picker v-model="form.end" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <el-form-item :label="tr('service.text.category')">
          <DictSelect v-model="form.category" dict="wageCategories" />
        </el-form-item>
        <el-form-item :label="tr('service.text.duration2')">
          <el-input-number v-model="form.hours" :min="0" :step="0.5" />
        </el-form-item>
        <el-form-item :label="tr('service.text.hourlyRate')">
          <el-input-number v-model="form.hourlyRate" :min="0" />
        </el-form-item>
        <el-form-item :label="tr('service.text.travelExpenses')">
          <el-input-number v-model="form.transportFee" :min="0" />
        </el-form-item>
        <el-form-item :label="tr('service.text.travelStations')">
          <el-input v-model="form.fromStation" :placeholder="tr('service.text.departureStation')" />
          <el-input v-model="form.toStation" :placeholder="tr('service.text.arrivalStation')" />
        </el-form-item>
        <el-form-item :label="tr('service.text.content')">
          <el-input v-model="form.content" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show=false">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ tr('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
