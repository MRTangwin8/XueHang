<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 批量发布面谈 / 面试时间段：主持老师 + 日期（多选或区间+星期）+ 自定义时段列表 → 预览 → 生成 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useDialogWidth } from '@/utils/format'
import { tz, dayjs } from '@/utils/time'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { interviewApi, type BatchResult, type InterviewKind } from '../api'

const { t: tr } = useI18n()

const props = defineProps<{ modelValue: boolean; kind: InterviewKind }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; created: [] }>()
const auth = useAuth()
const dict = useDict()
const dlgWidth = useDialogWidth('760px')
const formRef = ref<FormInstance>()
const kindName = computed(() => (props.kind === 'EXAM' ? tr('service.text.interview') : tr('service.text.consultation')))

const form = reactive({
  title: '',
  hostId: null as number | null,
  campusId: null as number | null,
  location: '',
  online: false,
  dateMode: 'pick' as 'pick' | 'range',
  dates: [] as string[],
  range: null as [string, string] | null,
  weekdays: [] as string[],
  times: [{ start: '10:00', end: '10:30' }] as { start: string; end: string }[],
})
const preview = ref<BatchResult | null>(null)
const busy = ref(false)

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    preview.value = null
    form.title = props.kind === 'EXAM' ? tr('service.text.mockInterview') : tr('service.text.admissionsConsultation')
    form.hostId = auth.me?.identity === 'TEACHER' ? auth.me.id : form.hostId
    form.campusId = auth.me?.campusId ?? null
  },
)
watch(
  () => [form.hostId, form.dateMode, form.dates, form.range, form.weekdays, form.times],
  () => (preview.value = null),
  { deep: true },
)

/** 在上一段结束时间后追加同长度的时段 */
function addTime() {
  const last = form.times[form.times.length - 1]
  if (!last) return form.times.push({ start: '10:00', end: '10:30' })
  const s = dayjs(`2000-01-01 ${last.start}`)
  const e = dayjs(`2000-01-01 ${last.end}`)
  const len = Math.max(e.diff(s, 'minute'), 15)
  const ns = e
  const ne = e.add(len, 'minute')
  form.times.push({ start: ns.format('HH:mm'), end: ne.isAfter(dayjs('2000-01-01 23:59')) ? '23:59' : ne.format('HH:mm') })
}
function quickFill(start: string, end: string, minutes: number) {
  const out: { start: string; end: string }[] = []
  let t = dayjs(`2000-01-01 ${start}`)
  const stop = dayjs(`2000-01-01 ${end}`)
  while (!t.add(minutes, 'minute').isAfter(stop)) {
    out.push({ start: t.format('HH:mm'), end: t.add(minutes, 'minute').format('HH:mm') })
    t = t.add(minutes, 'minute')
  }
  form.times = out
}
const disabledPast = (d: Date) => dayjs(d).isBefore(tz().startOf('day').toDate(), 'day')

function body(previewOnly: boolean) {
  return {
    kind: props.kind,
    title: form.title,
    hostId: form.hostId,
    campusId: form.campusId || null,
    location: form.location || null,
    online: form.online,
    dates: form.dateMode === 'pick' ? form.dates : { startDate: form.range?.[0], endDate: form.range?.[1], weekdays: form.weekdays.map(Number) },
    times: form.times,
    preview: previewOnly,
  }
}
function check() {
  if (!form.hostId) return tr('service.text.selectAHost')
  if (!form.title.trim()) return tr('service.text.enterATitle')
  if (form.dateMode === 'pick' && !form.dates.length) return tr('service.text.selectADate')
  if (form.dateMode === 'range' && (!form.range || !form.weekdays.length)) return tr('service.text.selectADateRangeAndWeekdays')
  if (!form.times.length) return tr('service.text.addAtLeastOneTimeSlot')
  for (const t of form.times) if (!t.start || !t.end || t.end <= t.start) return tr('service.text.invalidTimeSlot', { v0: t.start || '?', v1: t.end || '?' })
  return null
}
async function doPreview() {
  const err = check()
  if (err) return ElMessage.warning(err)
  busy.value = true
  try {
    preview.value = await interviewApi.batch(body(true))
  } finally {
    busy.value = false
  }
}
async function submit() {
  const err = check()
  if (err) return ElMessage.warning(err)
  busy.value = true
  try {
    const r = await interviewApi.batch(body(false))
    ElMessage.success(tr('service.text.publishedTimeSlots', { v0: r.created, v1: r.skipped.length ? tr('service.text.skipped', {
      v0: r.skipped.length }) : '' }))
    emit('created')
    emit('update:modelValue', false)
  } finally {
    busy.value = false
  }
}
const grouped = computed(() => {
  const m = new Map<string, string[]>()
  for (const s of preview.value?.slots ?? []) m.set(s.date, [...(m.get(s.date) ?? []), `${s.start}-${s.end}`])
  return [...m.entries()]
})
const wd = (d: string) => dayjs(d).format('ddd')
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="tr('service.text.publishSlots', { v0: kindName })"
    :width="dlgWidth"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)">
    <el-form ref="formRef" label-width="90px">
      <el-form-item :label="tr('service.text.title')" required>
        <el-input v-model="form.title" maxlength="100" :placeholder="tr('service.text.eGAdmissions', { v0: kindName })" />
      </el-form-item>
      <el-form-item :label="tr('service.text.host')" required>
        <UserSelect v-model="form.hostId" :placeholder="tr('service.text.selectATeacherStaffMember')" />
      </el-form-item>
      <el-form-item :label="tr('common.campus')">
        <CampusSelect v-model="form.campusId" :placeholder="tr('service.text.availableToAllCampuses')" />
      </el-form-item>
      <el-form-item :label="tr('service.text.format')">
        <el-radio-group v-model="form.online">
          <el-radio :value="false">{{ tr('service.text.inPerson') }}</el-radio>
          <el-radio :value="true">{{ tr('service.text.online') }}</el-radio>
        </el-radio-group>
        <el-input
          v-model="form.location"
          :placeholder="form.online ? tr('service.text.meetingLinkDetailsOptional') : tr('service.text.locationEG4fVip2')"
          style="flex: 1; margin-left: 12px; min-width: 180px" />
      </el-form-item>
      <el-form-item :label="tr('service.text.date')" required>
        <div class="col">
          <el-radio-group v-model="form.dateMode" size="small">
            <el-radio-button value="pick">{{ tr('service.text.selectIndividualDates') }}</el-radio-button>
            <el-radio-button value="range">{{ tr('service.text.dateRangeWeekdays') }}</el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-if="form.dateMode === 'pick'"
            v-model="form.dates"
            type="dates"
            value-format="YYYY-MM-DD"
            :placeholder="tr('service.text.clickToSelectMultipleDates')"
            :disabled-date="disabledPast"
            style="width: 100%" />
          <template v-else>
            <el-date-picker
              v-model="form.range"
              type="daterange"
              value-format="YYYY-MM-DD"
              :range-separator="tr('common.to')"
              :start-placeholder="tr('common.startDate')"
              :end-placeholder="tr('common.endDate')"
              :disabled-date="disabledPast"
              style="width: 100%" />
            <el-checkbox-group v-model="form.weekdays">
              <el-checkbox v-for="o in dict.options('weekdays')" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
            </el-checkbox-group>
          </template>
        </div>
      </el-form-item>
      <el-form-item :label="tr('service.text.timeSlots')" required>
        <div class="col">
          <div v-for="(t, i) in form.times" :key="i" class="time-row">
            <el-time-select v-model="t.start" start="07:00" end="22:00" step="00:15" :placeholder="tr('service.text.start')" style="width: 120px" />
            <span class="muted">—</span>
            <el-time-select
              v-model="t.end"
              start="07:15"
              end="23:00"
              step="00:15"
              :placeholder="tr('service.text.end')"
              :min-time="t.start"
              style="width: 120px" />
            <el-button link type="danger" icon="Delete" :disabled="form.times.length <= 1" @click="form.times.splice(i, 1)" />
          </div>
          <div class="time-actions">
            <el-button size="small" icon="Plus" @click="addTime">{{ tr('service.text.addSlot') }}</el-button>
            <span class="muted">{{ tr('service.text.quickFill') }}</span>
            <el-button size="small" link type="primary" @click="quickFill('10:00', '12:00', 30)">{{ tr('service.text.morning430Min') }}</el-button>
            <el-button size="small" link type="primary" @click="quickFill('14:00', '17:00', 30)">{{ tr('service.text.afternoon630Min') }}</el-button>
            <el-button size="small" link type="primary" @click="quickFill('13:00', '17:00', 60)">{{ tr('service.text.afternoon460Min') }}</el-button>
          </div>
          <div class="muted">{{ tr('service.text.eachSlotIsForOneStudentOnlySlotsOverlapping') }}</div>
        </div>
      </el-form-item>
    </el-form>

    <div v-if="preview" class="preview">
      <div class="pv-head">
        <i18n-t keypath="service.text.willCreateTimeSlots" scope="global">
          <template #n><b>{{ preview.slots.length }}</b></template>
        </i18n-t>
        <span v-if="preview.skipped.length" class="text-danger">{{ tr('service.text.skipped', { v0: preview.skipped.length }) }}</span>
      </div>
      <div class="pv-days">
        <div v-for="[d, ts] in grouped" :key="d" class="pv-day">
          <div class="pv-date">{{ d.slice(5) }} {{ wd(d) }}</div>
          <div class="pv-times"><span v-for="t in ts" :key="t" class="pv-chip">{{ t }}</span></div>
        </div>
      </div>
      <div v-if="preview.skipped.length" class="pv-skip">
        <div v-for="s in preview.skipped" :key="s.date + s.start" class="muted">✕ {{ s.date }} {{ s.start }}-{{ s.end }}：{{ s.reason }}</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ tr('common.cancel') }}</el-button>
      <el-button :loading="busy" @click="doPreview">{{ tr('service.text.preview') }}</el-button>
      <el-button type="primary" :loading="busy" @click="submit">{{ tr('service.text.confirmPublication') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.col { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.time-row { display: flex; align-items: center; gap: 8px; }
.time-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.preview { margin-top: 4px; background: #f7f8fc; border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px 14px; max-height: 280px; overflow: auto; }
.pv-head { margin-bottom: 8px; }
.pv-days { display: flex; flex-direction: column; gap: 6px; }
.pv-day { display: flex; gap: 10px; align-items: flex-start; }
.pv-date { width: 76px; flex-shrink: 0; font-weight: 600; font-size: 13px; padding-top: 2px; }
.pv-times { display: flex; flex-wrap: wrap; gap: 6px; }
.pv-chip { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: var(--xh-primary-soft); color: var(--xh-primary); }
.pv-skip { margin-top: 8px; }
</style>
