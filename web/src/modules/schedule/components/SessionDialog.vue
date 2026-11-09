<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 新建 / 编辑单个课次。
 *   <SessionDialog v-model="visible" :session="row" :preset="{ roomId, date, startTime }" @saved="reload" />
 * - 班课选 ClassGroup，VIP 选课时包（显示剩余课时），其他占用填标题
 * - 实时冲突检测；保存遇 409 显示冲突明细，有 schedule.edit 时可「仍然保存」
 * - 编辑批次课次时可选「仅本次 / 本次及以后 / 全部」
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import RoomSelect from '@/components/RoomSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDialogWidth } from '@/utils/format'
import { fmtTime, fmtDate, toApi, today } from '@/utils/time'
import { scheduleApi, type SessionPreset, type ClassGroup, type ConflictInfo, type EditScope, type SessionDetail, type SessionItem, type SessionKind,
  type VipPackage } from '../api'
import { TIME_OPTS, conflictDetails, diffHours, errorMessage } from '../utils'
import ConflictList from './ConflictList.vue'
import VipSelect from './VipSelect.vue'
import ClassSelect from './ClassSelect.vue'


const { t } = useI18n()

const props = defineProps<{ session?: SessionItem | SessionDetail | null; preset?: SessionPreset | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [] }>()

const auth = useAuth()
const width = useDialogWidth('620px')
const canEditAll = computed(() => auth.can('schedule.edit'))
const ownOnly = computed(() => !canEditAll.value && auth.can('schedule.own'))
/** 班课由教务排；教师需要「为本人任课的班级排班课」权限 */
const canClass = computed(() => canEditAll.value || auth.can('schedule.class_own'))
const editing = computed(() => !!props.session)
const confirmed = computed(() => props.session?.status === 'CONFIRMED')
const canFixConfirmedHours = computed(() => confirmed.value && props.session?.kind === 'VIP' && auth.can('vip.delete_confirmed'))

const form = reactive({
  kind: 'CLASS' as SessionKind,
  campusId: null as number | null,
  classGroupId: null as number | null,
  vipPackageId: null as number | null,
  title: '',
  roomId: null as number | null,
  teacherId: null as number | null,
  date: today(),
  startTime: '10:00',
  endTime: '12:00',
  hours: 2,
  note: '',
  scope: 'one' as EditScope,
})
const hoursTouched = ref(false)
const pkg = ref<VipPackage | null>(null)
const saving = ref(false)
const liveConflicts = ref<ConflictInfo[]>([])
const saveError = ref<{ message: string; details: unknown } | null>(null)
let initializing = false

watch(visible, (v) => v && init())

async function init() {
  initializing = true
  saveError.value = null
  liveConflicts.value = []
  hoursTouched.value = false
  pkg.value = null
  const s = props.session
  const p = props.preset ?? {}
  if (s) {
    Object.assign(form, {
      kind: s.kind, campusId: s.campusId, classGroupId: s.classGroupId, vipPackageId: s.vipPackageId, title: s.title,
      roomId: s.roomId, teacherId: s.teacherId, date: fmtDate(s.startAt), startTime: fmtTime(s.startAt), endTime: fmtTime(s.endAt),
      hours: s.hours, note: s.note ?? '', scope: 'one',
    })
    hoursTouched.value = Math.abs(s.hours - diffHours(form.startTime, form.endTime)) > 1e-6
  } else {
    Object.assign(form, {
      kind: p.kind ?? (p.vipPackageId || !canClass.value ? 'VIP' : 'CLASS'), campusId: p.campusId ?? auth.me?.campusId ?? null,
      classGroupId: p.classGroupId ?? null, vipPackageId: p.vipPackageId ?? null, title: p.title ?? '',
      roomId: p.roomId ?? null, teacherId: ownOnly.value ? auth.me!.id : p.teacherId ?? null,
      date: p.date ?? today(), startTime: p.startTime ?? '10:00', endTime: p.endTime ?? (p.startTime ? addHour(p.startTime, 2) : '12:00'),
      hours: 0, note: '', scope: 'one',
    })
    form.hours = diffHours(form.startTime, form.endTime)
  }
  await nextTick()
  initializing = false
  scheduleCheck()
}

function addHour(t: string, n: number) {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + n)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 时长变化 → 课时自动跟随（除非手动改过）
watch(() => [form.startTime, form.endTime], () => {
  if (!hoursTouched.value && !confirmed.value) form.hours = diffHours(form.startTime, form.endTime)
})

function onClassPicked(c: ClassGroup | null) {
  if (initializing || !c || editing.value) return
  form.campusId = c.campusId
  if (!ownOnly.value && c.teacherId) form.teacherId = c.teacherId
  if (c.defaultRoomId) form.roomId = c.defaultRoomId
}
function onVipPicked(p: VipPackage | null) {
  pkg.value = p
  if (initializing || !p || editing.value) return
  if (!form.teacherId && p.teachers.length === 1 && !ownOnly.value) form.teacherId = p.teachers[0].id
}

/** VIP 可用课时：编辑时把本节原课时加回 */
const available = computed(() => {
  if (!pkg.value) return null
  const back = editing.value && props.session?.status === 'SCHEDULED' ? props.session.hours : 0
  return Math.round((pkg.value.remaining + back) * 100) / 100
})
const hoursShort = computed(() => form.kind === 'VIP' && available.value != null && !confirmed.value && form.hours > available.value + 1e-6)

const isSeries = computed(() => !!props.session?.seriesId && !confirmed.value)
const timeInvalid = computed(() => !form.startTime || !form.endTime || form.endTime <= form.startTime)

// ---------------- 实时冲突检测 ----------------
let timer: ReturnType<typeof setTimeout> | undefined
function scheduleCheck() {
  clearTimeout(timer)
  timer = setTimeout(runCheck, 350)
}
async function runCheck() {
  if (!visible.value || confirmed.value || timeInvalid.value || !form.date) {
    liveConflicts.value = []
    return
  }
  if (!form.roomId && !form.teacherId && !form.vipPackageId) return (liveConflicts.value = [])
  try {
    const [r] = await scheduleApi.check([{
      roomId: form.roomId, teacherId: form.teacherId, vipPackageId: form.kind === 'VIP' ? form.vipPackageId : null,
      startAt: toApi(form.date, form.startTime), endAt: toApi(form.date, form.endTime), excludeId: props.session?.id,
    }])
    liveConflicts.value = r ?? []
  } catch {
    liveConflicts.value = []
  }
}
watch(() => [form.roomId, form.teacherId, form.vipPackageId, form.kind, form.date, form.startTime, form.endTime], () => !initializing && scheduleCheck())

// ---------------- 保存 ----------------
const bulkConflicts = computed(() => {
  const d = saveError.value?.details
  if (!Array.isArray(d) || !d.length) return null
  return 'conflicts' in (d[0] as object) ? (d as { sessionId?: number; date: string; conflicts: ConflictInfo[] }[]) : null
})
const flatConflicts = computed(() => (Array.isArray(saveError.value?.details) && !bulkConflicts.value ? (saveError.value!.details as ConflictInfo[]) : []))

function validate(): string | null {
  if (!form.campusId && !form.roomId) return t('schedule.pleaseSelectACampus')
  if (form.kind === 'CLASS' && !form.classGroupId) return t('schedule.pleaseSelectAGroupClass')
  if (form.kind === 'VIP' && !form.vipPackageId) return t('schedule.pleaseSelectAVipLessonPackage')
  if (form.kind === 'OTHER' && !form.title.trim()) return t('schedule.pleaseEnterTheBookingPurpose')
  if (!form.date) return t('schedule.pleaseSelectADate')
  if (timeInvalid.value) return t('schedule.endTimeMustBeLaterThanStart')
  if (form.kind === 'VIP' && !(form.hours > 0)) return t('schedule.vipLessonHoursMustBeGreaterThan')
  if (hoursShort.value) return t('schedule.insufficientHoursHAvailable', { p0: available.value })
  return null
}

async function save(force = false) {
  const err = validate()
  if (err) return ElMessage.warning(err)
  saving.value = true
  saveError.value = null
  try {
    if (!editing.value) {
      await scheduleApi.create({
        kind: form.kind, campusId: form.campusId, title: form.title.trim() || null, roomId: form.roomId, teacherId: form.teacherId,
        classGroupId: form.kind === 'CLASS' ? form.classGroupId : null, vipPackageId: form.kind === 'VIP' ? form.vipPackageId : null,
        startAt: toApi(form.date, form.startTime), endAt: toApi(form.date, form.endTime),
        hours: form.kind === 'OTHER' ? null : form.hours, note: form.note.trim() || null, force,
      })
      ElMessage.success(t('schedule.sessionCreated'))
    } else if (confirmed.value) {
      await scheduleApi.update(props.session!.id, { note: form.note.trim() || null, hours: canFixConfirmedHours.value ? form.hours : undefined, scope: 'one' })
      ElMessage.success(t('common.saved'))
    } else {
      const r = await scheduleApi.update(props.session!.id, {
        title: form.title.trim() || undefined, roomId: form.roomId, teacherId: form.teacherId,
        date: form.scope === 'one' ? form.date : undefined, startTime: form.startTime, endTime: form.endTime,
        hours: form.kind === 'OTHER' ? undefined : form.hours, note: form.note.trim() || null, scope: form.scope, force,
      })
      ElMessage.success(r.updated > 1 ? t('schedule.updatedSessions', { p0: r.updated, p1: r.skipped ? t('schedule.sessionsSkippedDueToPermissions',
        { p0: r.skipped }) : '' }) : t('common.saved'))
    }
    visible.value = false
    emit('saved')
  } catch (e) {
    const c = conflictDetails(e)
    if (c) saveError.value = c
    else ElMessage.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

const title = computed(() => (editing.value ? (confirmed.value ? t('schedule.sessionNotes') : t('schedule.editSession')) : t('schedule.newSession')))
</script>

<template>
  <el-dialog v-model="visible" :title="title" :width="width" :close-on-click-modal="false" append-to-body class="session-dialog">
    <el-alert v-if="confirmed" type="info" :closable="false" show-icon class="mb">
      {{ t('schedule.thisSessionIsConfirmedOnlyNotesCan', { p0: canFixConfirmedHours ? t('schedule.andHoursCorrectingConfirmedHoursAlsoUpdates') : '' }) }}
    </el-alert>
    <el-form label-width="84px" :disabled="saving">
      <el-form-item :label="t('schedule.type')">
        <el-radio-group v-model="form.kind" :disabled="editing">
          <el-radio-button v-if="canClass || form.kind === 'CLASS'" value="CLASS" :disabled="!canClass">{{ t('schedule.groupClass') }}</el-radio-button>
          <el-radio-button value="VIP">VIP</el-radio-button>
          <el-radio-button value="OTHER">{{ t('schedule.otherBooking') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('common.campus')">
        <CampusSelect v-model="form.campusId" :clearable="false" :placeholder="t('schedule.selectCampus')" :disabled="editing" style="width: 100%" />
      </el-form-item>
      <el-form-item v-if="form.kind === 'CLASS'" :label="t('schedule.groupClass')" required>
        <ClassSelect
          v-model="form.classGroupId"
          :campus-id="editing ? null : form.campusId"
          :disabled="editing"
          :include-finished="editing"
          @picked="onClassPicked"
        />
      </el-form-item>
      <el-form-item v-if="form.kind === 'VIP'" :label="t('schedule.lessonPackage')" required>
        <VipSelect v-model="form.vipPackageId" :disabled="editing" @picked="onVipPicked" />
        <div v-if="pkg" class="muted pkg-line">
          {{ t('schedule.packageHoursSummary', { p0: pkg.totalHours, p1: pkg.usedHours, p2: pkg.pendingHours }) }}
          <b :class="hoursShort ? 'text-danger' : 'text-success'">{{ t('schedule.availableH', { p0: available }) }}</b>
        </div>
      </el-form-item>
      <el-form-item :label="form.kind === 'OTHER' ? t('schedule.bookingPurpose') : t('schedule.title')" :required="form.kind === 'OTHER'">
        <el-input
          v-model="form.title"
          :disabled="confirmed"
          maxlength="100"
          :placeholder="form.kind === 'OTHER' ? t('schedule.eGTeachingStaffMeetingMockInterview') : t('schedule.defaultsToClassNameVipStudentName')"
        />
      </el-form-item>
      <el-form-item :label="t('schedule.room')">
        <RoomSelect v-model="form.roomId" :campus-id="form.campusId" :vip-only="form.kind === 'VIP'" :disabled="confirmed" style="width: 100%" />
      </el-form-item>
      <el-form-item :label="t('schedule.teacher')">
        <UserSelect v-model="form.teacherId" identity="TEACHER" :disabled="ownOnly || confirmed" style="width: 100%" />
      </el-form-item>
      <el-form-item v-if="isSeries" :label="t('schedule.applyTo')">
        <el-radio-group v-model="form.scope">
          <el-radio value="one">{{ t('schedule.thisSessionOnly') }}</el-radio>
          <el-radio value="following">{{ t('schedule.thisAndFollowingSessions') }}</el-radio>
          <el-radio value="all">{{ t('schedule.allSessionsInThisSeries') }}</el-radio>
        </el-radio-group>
        <div v-if="form.scope !== 'one'" class="muted">{{ t('schedule.bulkEditsKeepEachDateAndOnly') }}</div>
      </el-form-item>
      <el-form-item :label="t('schedule.date')" required>
        <el-date-picker
          v-model="form.date"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
          :disabled="confirmed || form.scope !== 'one'"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="t('schedule.timeSlot')" required>
        <div class="time-row">
          <el-time-select v-model="form.startTime" v-bind="TIME_OPTS" :clearable="false" :disabled="confirmed" :placeholder="t('schedule.start')" />
          <span class="muted">{{ t('common.to') }}</span>
          <el-time-select
            v-model="form.endTime"
            v-bind="TIME_OPTS"
            :min-time="form.startTime"
            :clearable="false"
            :disabled="confirmed"
            :placeholder="t('schedule.end')"
          />
        </div>
      </el-form-item>
      <el-form-item v-if="form.kind !== 'OTHER'" :label="form.kind === 'VIP' ? t('schedule.hoursToDeduct') : t('schedule.lessonHours')">
        <el-input-number
          v-model="form.hours"
          :min="0"
          :max="12"
          :step="0.5"
          :precision="2"
          :disabled="confirmed && !canFixConfirmedHours"
          @change="hoursTouched = true"
        />
        <span class="muted" style="margin-left: 8px">{{ t('schedule.hours', { p0: form.kind === 'VIP' ? t('schedule.defaultsToDuration') : '' }) }}</span>
      </el-form-item>
      <el-form-item :label="t('common.remark')">
        <el-input v-model="form.note" type="textarea" :rows="2" maxlength="1000" />
      </el-form-item>
    </el-form>

    <div v-if="liveConflicts.length && !saveError" class="live">
      <div class="live-head"><el-icon><WarningFilled /></el-icon> {{ t('schedule.conflictsInThisTimeSlot', { p0: liveConflicts.length }) }}</div>
      <ConflictList :items="liveConflicts" compact />
    </div>
    <div v-else-if="!confirmed && !timeInvalid && (form.roomId || form.teacherId)" class="live ok">
      <el-icon><CircleCheckFilled /></el-icon> {{ t('schedule.roomTeacherStudentAreAllAvailableIn') }}
    </div>

    <div v-if="saveError" class="save-error">
      <div class="live-head"><el-icon><WarningFilled /></el-icon> {{ saveError.message }}</div>
      <ConflictList v-if="flatConflicts.length" :items="flatConflicts" compact />
      <div v-for="g in bulkConflicts ?? []" :key="g.date" class="bulk-group">
        <div class="muted">{{ g.date }}</div>
        <ConflictList :items="g.conflicts" compact />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button v-if="saveError && canEditAll" type="warning" :loading="saving" @click="save(true)">{{ t('schedule.saveAnyway') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save(false)">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mb { margin-bottom: 14px; }
.pkg-line { width: 100%; margin-top: 4px; line-height: 1.5; }
.time-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.time-row .el-select { flex: 1; min-width: 0; }
.live { margin-top: 4px; padding: 10px 12px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa; }
.live.ok { background: #f0fdfa; border-color: #99f6e4; color: #0f766e; display: flex; align-items: center; gap: 6px; font-size: 13px; }
.live-head { display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 8px; color: #c2410c; }
.save-error { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; max-height: 260px; overflow: auto; }
.save-error .live-head { color: #b91c1c; }
.bulk-group + .bulk-group { margin-top: 8px; }
@media (max-width: 767px) {
  .time-row { flex-direction: column; align-items: stretch; }
  .time-row .el-select { width: 100%; }
  .time-row > .muted { align-self: center; line-height: 1; }
}
</style>
