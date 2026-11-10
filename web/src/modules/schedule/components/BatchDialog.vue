<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 批量排课：日期区间 + 周期（每天 / 周一…周日）+ 时段 + 教室 + 老师 + 班课 / VIP
 * 「预览」列出全部日期并标红冲突；可跳过冲突项；提交后提示创建 / 跳过数量。
 *   <BatchDialog v-model="visible" :preset="{ kind: 'CLASS', classGroupId }" @saved="reload" />
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import RoomSelect from '@/components/RoomSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { dayjs, today } from '@/utils/time'
import { scheduleApi, type SessionPreset, type BatchPayload, type BatchPreviewItem, type ClassGroup, type ConflictInfo, type SessionKind,
  type VipPackage } from '../api'
import { weekdayLabel, TIME_OPTS, conflictDetails, diffHours, errorMessage } from '../utils'
import ConflictList from './ConflictList.vue'
import VipSelect from './VipSelect.vue'
import ClassSelect from './ClassSelect.vue'

const { t } = useI18n()

const props = defineProps<{ preset?: SessionPreset | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [] }>()

const auth = useAuth()
/** 业务规则「排课必须选择教室」（默认开启） */
const roomRequired = computed(() => useDict().rules?.sessionRoomRequired !== false)
const width = useDialogWidth('820px')
const isMobile = useIsMobile()
const canEditAll = computed(() => auth.can('schedule.edit'))
const ownOnly = computed(() => !canEditAll.value && auth.can('schedule.own'))
/** 班课由教务排；教师需要「为本人任课的班级排班课」权限 */
const canClass = computed(() => canEditAll.value || auth.can('schedule.class_own'))

const form = reactive({
  kind: 'CLASS' as SessionKind,
  campusId: null as number | null,
  classGroupId: null as number | null,
  vipPackageId: null as number | null,
  title: '',
  roomId: null as number | null,
  teacherId: null as number | null,
  range: [today(), dayjs(today()).add(4, 'week').format('YYYY-MM-DD')] as [string, string],
  weekdays: [] as number[],
  startTime: '10:00',
  endTime: '12:00',
  hours: 2,
  skipConflicts: true,
  note: '',
})
const hoursTouched = ref(false)
const pkg = ref<VipPackage | null>(null)
const preview = ref<BatchPreviewItem[] | null>(null)
const previewing = ref(false)
const saving = ref(false)
const saveError = ref<{ message: string; details: { date: string; conflicts: ConflictInfo[] }[] } | null>(null)
let initializing = false

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const everyDay = computed({
  get: () => form.weekdays.length === 7,
  set: (v: boolean) => (form.weekdays = v ? [...ALL_DAYS] : []),
})
const someDays = computed(() => form.weekdays.length > 0 && form.weekdays.length < 7)

watch(visible, async (v) => {
  if (!v) return
  initializing = true
  const p = props.preset ?? {}
  Object.assign(form, {
    kind: p.kind ?? (p.vipPackageId || !canClass.value ? 'VIP' : 'CLASS'), campusId: p.campusId ?? auth.me?.campusId ?? null,
    classGroupId: p.classGroupId ?? null, vipPackageId: p.vipPackageId ?? null, title: p.title ?? '',
    roomId: p.roomId ?? null, teacherId: ownOnly.value ? auth.me!.id : p.teacherId ?? null,
    range: [p.date ?? today(), dayjs(p.date ?? today()).add(4, 'week').subtract(1, 'day').format('YYYY-MM-DD')],
    weekdays: p.date ? [dayjs(p.date).isoWeekday()] : [], startTime: p.startTime ?? '10:00', endTime: p.endTime ?? '12:00',
    skipConflicts: true, note: '',
  })
  form.hours = diffHours(form.startTime, form.endTime)
  hoursTouched.value = false
  preview.value = null
  saveError.value = null
  await nextTick()
  initializing = false
})

watch(() => [form.startTime, form.endTime], () => {
  if (!hoursTouched.value) form.hours = diffHours(form.startTime, form.endTime)
})
// 条件变化后预览作废
watch(() => [form.kind, form.campusId, form.classGroupId, form.vipPackageId, form.roomId, form.teacherId, form.range, form.weekdays, form.startTime,
  form.endTime, form.hours], () => {
  preview.value = null
  saveError.value = null
}, { deep: true })

function onClassPicked(c: ClassGroup | null) {
  if (initializing || !c) return
  form.campusId = c.campusId
  if (!ownOnly.value && c.teacherId) form.teacherId = c.teacherId
  if (c.defaultRoomId) form.roomId = c.defaultRoomId
}
function onVipPicked(p: VipPackage | null) {
  pkg.value = p
  if (initializing || !p) return
  if (!form.teacherId && p.teachers.length === 1 && !ownOnly.value) form.teacherId = p.teachers[0].id
}

const payload = (): BatchPayload => ({
  kind: form.kind, campusId: form.campusId, title: form.title.trim() || null, roomId: form.roomId, teacherId: form.teacherId,
  classGroupId: form.kind === 'CLASS' ? form.classGroupId : null, vipPackageId: form.kind === 'VIP' ? form.vipPackageId : null,
  hours: form.kind === 'OTHER' ? null : form.hours, note: form.note.trim() || null,
  startDate: form.range?.[0], endDate: form.range?.[1], weekdays: [...form.weekdays].sort(), startTime: form.startTime, endTime: form.endTime,
  skipConflicts: form.skipConflicts,
})

function validate(): string | null {
  if (form.kind === 'CLASS' && !form.classGroupId) return t('schedule.pleaseSelectAGroupClass')
  if (form.kind === 'VIP' && !form.vipPackageId) return t('schedule.pleaseSelectAVipLessonPackage')
  if (form.kind === 'OTHER' && !form.title.trim()) return t('schedule.pleaseEnterTheBookingPurpose')
  if (!form.range?.[0] || !form.range?.[1]) return t('schedule.pleaseSelectADateRange')
  if (!form.weekdays.length) return t('schedule.pleaseSelectTheTeachingDays')
  if (!form.startTime || !form.endTime || form.endTime <= form.startTime) return t('schedule.endTimeMustBeLaterThanStart')
  if (roomRequired.value && !form.roomId) return t('schedule.pleaseSelectARoom')
  if (!form.roomId && !form.teacherId) return t('schedule.pleaseSelectAtLeastARoomOr')
  return null
}

const stats = computed(() => {
  const list = preview.value ?? []
  const bad = list.filter((i) => i.conflicts.length).length
  const willCreate = form.skipConflicts ? list.length - bad : list.length
  return { total: list.length, bad, willCreate, needHours: Math.round(willCreate * form.hours * 100) / 100 }
})
const hoursShort = computed(() => form.kind === 'VIP' && !!pkg.value && stats.value.needHours > pkg.value.remaining + 1e-6)

async function doPreview() {
  const err = validate()
  if (err) return ElMessage.warning(err)
  previewing.value = true
  try {
    preview.value = await scheduleApi.batchPreview(payload())
    saveError.value = null
  } finally {
    previewing.value = false
  }
}

async function submit(force = false) {
  const err = validate()
  if (err) return ElMessage.warning(err)
  if (!preview.value) await doPreview()
  if (!preview.value) return
  if (stats.value.willCreate === 0) return ElMessage.warning(t('schedule.noSessionsCanBeCreated'))
  if (hoursShort.value) return ElMessage.warning(t('schedule.insufficientHoursHRequiredHRemaining', { p0: stats.value.needHours, p1: pkg.value?.remaining }))
  if (!force) {
    try {
      await ElMessageBox.confirm(
        t('schedule.createSessionsProceed', { p0: stats.value.willCreate, p1: stats.value.bad && form.skipConflicts ?
          t('schedule.skippingConflictingDates', { p0: stats.value.bad }) : '', p2: form.kind === 'VIP' ?
          t('schedule.deductingHInTotalPendingConfirmation', { p0: stats.value.needHours }) : '' }),
        t('schedule.batchScheduling'), { type: 'info', confirmButtonText: t('schedule.generate') },
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    const r = await scheduleApi.batch({ ...payload(), skipConflicts: force ? false : form.skipConflicts, force })
    ElMessage.success(t('schedule.createdSessions', { p0: r.created, p1: r.skipped.length ? t('schedule.skippingConflictingDates',
      { p0: r.skipped.length }) : '' }))
    visible.value = false
    emit('saved')
  } catch (e) {
    const c = conflictDetails(e)
    if (c) saveError.value = c as typeof saveError.value
    else ElMessage.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('schedule.batchScheduling')" :width="width" :close-on-click-modal="false" append-to-body top="6vh">
    <el-form label-width="84px" :disabled="saving">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('schedule.type')">
            <el-radio-group v-model="form.kind">
              <el-radio-button v-if="canClass || form.kind === 'CLASS'" value="CLASS" :disabled="!canClass">{{ t('schedule.groupClass') }}</el-radio-button>
              <el-radio-button value="VIP">VIP</el-radio-button>
              <el-radio-button value="OTHER">{{ t('schedule.other') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('common.campus')">
            <CampusSelect v-model="form.campusId" :clearable="false" :placeholder="t('schedule.selectCampus')" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item v-if="form.kind === 'CLASS'" :label="t('schedule.groupClass')" required>
            <ClassSelect v-model="form.classGroupId" :campus-id="form.campusId" @picked="onClassPicked" />
          </el-form-item>
          <el-form-item v-else-if="form.kind === 'VIP'" :label="t('schedule.lessonPackage')" required>
            <VipSelect v-model="form.vipPackageId" @picked="onVipPicked" />
          </el-form-item>
          <el-form-item v-else :label="t('schedule.bookingPurpose')" required>
            <el-input v-model="form.title" maxlength="100" :placeholder="t('schedule.eGTeachingStaffMeeting')" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('schedule.room')" :required="roomRequired">
            <RoomSelect v-model="form.roomId" :campus-id="form.campusId" :vip-only="form.kind === 'VIP'" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('schedule.teacher')">
            <UserSelect v-model="form.teacherId" identity="TEACHER" :disabled="ownOnly" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('schedule.dateRange')" required>
            <el-date-picker
              v-model="form.range"
              type="daterange"
              value-format="YYYY-MM-DD"
              :range-separator="t('common.to')"
              :start-placeholder="t('schedule.start')"
              :end-placeholder="t('schedule.end')"
              :clearable="false"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item :label="t('schedule.recurrence')" required>
            <div class="weekdays">
              <el-checkbox v-model="everyDay" :indeterminate="someDays" class="every">{{ t('schedule.everyDay') }}</el-checkbox>
              <el-checkbox-group v-model="form.weekdays">
                <el-checkbox-button v-for="d in ALL_DAYS" :key="d" :value="d">{{ weekdayLabel(d) }}</el-checkbox-button>
              </el-checkbox-group>
            </div>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('schedule.timeSlot')" required>
            <div class="time-row">
              <el-time-select v-model="form.startTime" v-bind="TIME_OPTS" :clearable="false" />
              <span class="muted">{{ t('common.to') }}</span>
              <el-time-select v-model="form.endTime" v-bind="TIME_OPTS" :min-time="form.startTime" :clearable="false" />
            </div>
          </el-form-item>
        </el-col>
        <el-col v-if="form.kind !== 'OTHER'" :xs="24" :sm="12">
          <el-form-item :label="form.kind === 'VIP' ? t('schedule.hoursDeductedPerSession') : t('schedule.hoursPerSession')">
            <el-input-number v-model="form.hours" :min="0" :max="12" :step="0.5" :precision="2" @change="hoursTouched = true" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item :label="t('schedule.conflictHandling')">
            <el-switch v-model="form.skipConflicts" :active-text="t('schedule.skipConflictingDatesAndCreateTheRest')" inactive-text="" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <div v-if="form.kind === 'VIP' && pkg" class="pkg-bar">
      <span>{{ pkg.student.name }} · {{ pkg.name }}</span>
      <span class="muted">{{ t('schedule.totalHConfirmedHPendingH', { p0: pkg.totalHours, p1: pkg.usedHours, p2: pkg.pendingHours }) }}</span>
      <b :class="hoursShort ? 'text-danger' : 'text-success'">{{ t('schedule.remainingH', { p0: pkg.remaining }) }}</b>
    </div>

    <div v-if="preview" class="preview">
      <div class="preview-head">
        <span>{{ t('schedule.total') }} <b>{{ stats.total }}</b> {{ t('schedule.dates') }}</span>
        <span v-if="stats.bad" class="text-danger">{{ t('schedule.conflict') }} <b>{{ stats.bad }}</b></span>
        <span v-else class="text-success">{{ t('schedule.noConflicts') }}</span>
        <span>{{ t('schedule.toCreate') }} <b>{{ stats.willCreate }}</b> {{ t('schedule.sessionUnit') }}</span>
        <span v-if="form.kind === 'VIP'" :class="{ 'text-danger': hoursShort }">{{ t('schedule.requiresH', { p0: stats.needHours }) }}</span>
      </div>
      <div class="preview-list">
        <div v-for="i in preview" :key="i.date" class="pv" :class="{ bad: i.conflicts.length }">
          <div class="pv-date">
            <span class="d">{{ i.date.slice(5) }}</span>
            <span class="w">{{ weekdayLabel(i.weekday) }}</span>
            <el-tag v-if="i.conflicts.length" size="small" type="danger" disable-transitions>{{
              form.skipConflicts ? t('schedule.willSkip') : t('schedule.conflict')
            }}</el-tag>
            <el-icon v-else class="text-success"><CircleCheckFilled /></el-icon>
          </div>
          <ConflictList v-if="i.conflicts.length && !isMobile" :items="i.conflicts" compact />
          <div v-else-if="i.conflicts.length" class="muted">{{ i.conflicts.map((c) => c.title).join(t('schedule.listSeparator')) }}</div>
        </div>
      </div>
    </div>

    <div v-if="saveError" class="save-error">
      <b>{{ saveError.message }}</b>
      <div v-for="g in saveError.details ?? []" :key="g.date" class="bulk-group">
        <div class="muted">{{ g.date }}</div>
        <ConflictList :items="g.conflicts" compact />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.close') }}</el-button>
      <el-button :loading="previewing" @click="doPreview">{{ t('schedule.preview') }}</el-button>
      <el-button v-if="saveError && canEditAll" type="warning" :loading="saving" @click="submit(true)">{{
        t('schedule.ignoreConflictsAndCreateAll')
      }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="!!preview && stats.willCreate === 0" @click="submit(false)">{{
        t('schedule.createSessions')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.weekdays { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.every { margin-right: 4px; }
.time-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.time-row .el-select { flex: 1; min-width: 0; }
.pkg-bar {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 12px; border-radius: 10px;
  background: var(--xh-kind-vip-bg); margin-bottom: 12px; font-size: 13px;
}
.preview { border: 1px solid var(--xh-border); border-radius: 10px; overflow: hidden; }
.preview-head {
  display: flex; flex-wrap: wrap; gap: 16px; padding: 10px 14px; background: #f7f8fc;
  border-bottom: 1px solid var(--xh-border); font-size: 13px;
}
.preview-list { max-height: 300px; overflow: auto; padding: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.pv { padding: 6px 10px; border-radius: 8px; background: #f0fdfa; border: 1px solid #ccfbf1; }
.pv.bad { grid-column: 1 / -1; background: #fef2f2; border-color: #fecaca; }
.pv-date { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.pv-date .d { font-weight: 600; font-variant-numeric: tabular-nums; }
.pv-date .w { color: var(--xh-text-2); font-size: 12px; }
.pv.bad .pv-date { margin-bottom: 6px; }
.save-error {
  margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca;
  max-height: 240px; overflow: auto; color: #b91c1c;
}
.bulk-group { margin-top: 8px; }
@media (max-width: 767px) {
  .weekdays, .weekdays :deep(.el-checkbox-group) { align-items: stretch; width: 100%; }
  .weekdays :deep(.el-checkbox-group) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .weekdays :deep(.el-checkbox-button), .weekdays :deep(.el-checkbox-button__inner) { width: 100%; }
  .time-row { flex-direction: column; align-items: stretch; }
  .time-row .el-select { width: 100%; }
  .time-row > .muted { align-self: center; line-height: 1; }
  .preview-head { gap: 8px 12px; }
  .preview-list { grid-template-columns: minmax(0, 1fr); }
}
</style>
