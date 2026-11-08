<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 课次详情抽屉：详情、状态、课时、课堂记录；操作按钮（编辑 / 确认 / 取消 / 删除已确认）按 canEdit 显示。
 *   <SessionDrawer v-model="drawer" :session-id="id" @changed="reload" />
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import { useIsMobile } from '@/utils/format'
import { fmtDateTime, fmtMonthDay } from '@/utils/time'
import { scheduleApi, type EditScope, type SessionDetail } from '../api'
import { weekdayLabel, CONFIRMED_BY, KIND_LABEL, kindStyle, timeRange } from '../utils'
import SessionDialog from './SessionDialog.vue'

const { t } = useI18n()

const props = defineProps<{ sessionId: number | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ changed: [] }>()
const isMobile = useIsMobile()

const s = ref<SessionDetail | null>(null)
const loading = ref(false)
const busy = ref(false)
const editVisible = ref(false)

const rec = reactive({ content: '', homework: '', performance: '', studentVisible: true })
const recEditing = ref(false)
const recSaving = ref(false)

async function load() {
  if (!props.sessionId) return
  loading.value = true
  try {
    s.value = await scheduleApi.session(props.sessionId)
    const r = s.value.record
    Object.assign(rec, { content: r?.content ?? '', homework: r?.homework ?? '', performance: r?.performance ?? '', studentVisible: r?.studentVisible ?? true })
    recEditing.value = false
  } finally {
    loading.value = false
  }
}
watch(() => [visible.value, props.sessionId], () => visible.value && load(), { immediate: true })

const changed = async () => {
  emit('changed')
  await load()
}

const started = computed(() => !!s.value && new Date(s.value.startAt).getTime() <= Date.now())
const weekdaysText = computed(() => s.value?.series?.weekdays.split(',').map((d) => weekdayLabel(+d)).join(' ') ?? '')

async function confirm() {
  if (!s.value) return
  const tip = s.value.kind === 'VIP' ? t('schedule.afterConfirmationHMoveFromPendingTo',
    { p0: s.value.hours }) : t('schedule.confirmThatThisSessionHasBeenCompleted')
  try {
    await ElMessageBox.confirm(`${started.value ?
      '' : t('schedule.thisSessionHasNotStartedYet')}${tip}`, t('schedule.confirmSession'), { type: started.value ? 'info' : 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    await scheduleApi.confirm(s.value.id)
    ElMessage.success(t('schedule.confirmed'))
    await changed()
  } finally {
    busy.value = false
  }
}

// ---------------- 取消 / 删除 ----------------
const cancelVisible = ref(false)
const cancelForm = reactive({ scope: 'one' as EditScope, reason: '' })
const isConfirmed = computed(() => s.value?.status === 'CONFIRMED')
function openCancel() {
  Object.assign(cancelForm, { scope: 'one', reason: '' })
  cancelVisible.value = true
}
async function doCancel() {
  if (!s.value) return
  busy.value = true
  try {
    const r = await scheduleApi.cancel(s.value.id, { scope: isConfirmed.value ? 'one' : cancelForm.scope, reason: cancelForm.reason.trim() || undefined })
    ElMessage.success(t('schedule.cancelResult', { p0: isConfirmed.value ? t('common.deleted') : t('schedule.cancelled'), p1: r.cancelled,
      p2: r.releasedHours ? t('schedule.hReturned', { p0: r.releasedHours }) : '', p3: r.skipped ? t('schedule.sessionsSkipped', { p0: r.skipped }) : '' }))
    cancelVisible.value = false
    await changed()
  } finally {
    busy.value = false
  }
}

async function saveRecord() {
  if (!s.value) return
  if (!rec.content.trim()) return ElMessage.warning(t('schedule.pleaseEnterTheLessonContent'))
  recSaving.value = true
  try {
    await scheduleApi.saveRecord(s.value.id, { content: rec.content.trim(), homework: rec.homework.trim() || null, performance: rec.performance.trim() ||
      null, studentVisible: rec.studentVisible })
    ElMessage.success(t('schedule.lessonRecordSaved'))
    await changed()
  } finally {
    recSaving.value = false
  }
}
</script>

<template>
  <el-drawer v-model="visible" :size="isMobile ? '100%' : '460px'" :with-header="false" append-to-body class="session-drawer">
    <div v-loading="loading" class="wrap">
      <template v-if="s">
        <div class="hero" :style="kindStyle(s.kind)">
          <div class="hero-top">
            <span class="kind">{{ KIND_LABEL[s.kind] }}</span>
            <DictTag dict="sessionStatuses" :value="s.status" />
            <span class="spacer" />
            <el-button text circle icon="Close" @click="visible = false" />
          </div>
          <h3>{{ s.title }}</h3>
          <div class="when">{{ fmtMonthDay(s.startAt) }} <b>{{ timeRange(s) }}</b></div>
        </div>

        <div class="actions" v-if="s.canEdit && s.status !== 'CANCELLED'">
          <el-button v-if="s.status === 'SCHEDULED'" type="primary" icon="Select" :loading="busy" @click="confirm">{{
            t('schedule.confirmSession')
          }}</el-button>
          <el-button icon="Edit" @click="editVisible = true">{{ isConfirmed ? t('common.remark') : t('schedule.modify') }}</el-button>
          <el-button v-if="s.status === 'SCHEDULED'" icon="CloseBold" @click="openCancel">{{ t('common.cancel') }}</el-button>
          <el-button v-else-if="isConfirmed && s.canCancelConfirmed" type="danger" plain icon="Delete" @click="openCancel">{{
            t('schedule.deleteConfirmed')
          }}</el-button>
        </div>

        <el-descriptions :column="1" size="small" class="desc">
          <el-descriptions-item :label="t('common.campus')">{{ s.campus.name }}</el-descriptions-item>
          <el-descriptions-item :label="t('schedule.room')">{{ s.room?.name ?? '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('schedule.teacher')">{{ s.teacher?.name ?? '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="s.classGroup" :label="t('schedule.groupClass')">{{
            t('schedule.students', { p0: s.classGroup.name, p1: s.classGroup._count.students })
          }}</el-descriptions-item>
          <el-descriptions-item v-if="s.vipPackage" :label="t('schedule.vipStudent')">{{
            s.vipPackage.student.name
          }} · {{
            s.vipPackage.name
          }}</el-descriptions-item>
          <el-descriptions-item v-if="s.kind === 'VIP' || s.hours" :label="t('schedule.lessonHours')">{{ s.hours }}h</el-descriptions-item>
          <el-descriptions-item v-if="s.series" :label="t('schedule.series')">
            {{ t('schedule.sessionsInTotal', { p0: s.series.startDate, p1: s.series.endDate, p2: weekdaysText, p3: s.seriesCount }) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="s.confirmedAt" :label="t('common.confirmTitle')">{{
            fmtDateTime(s.confirmedAt)
          }} · {{
            CONFIRMED_BY[s.confirmedBy ?? ''] ?? s.confirmedBy
          }}</el-descriptions-item>
          <el-descriptions-item v-if="s.note" :label="t('common.remark')"><span class="pre">{{ s.note }}</span></el-descriptions-item>
        </el-descriptions>

        <div v-if="s.vipPackage" class="ledger">
          <div class="ledger-title">{{ t('schedule.hoursLedger', { p0: s.vipPackage.name }) }}</div>
          <div class="ledger-nums">
            <div><span>{{ t('schedule.totalHours') }}</span><b>{{ s.vipPackage.totalHours }}</b></div>
            <div><span>{{ t('schedule.confirmed') }}</span><b class="used">{{ s.vipPackage.usedHours }}</b></div>
            <div><span>{{ t('schedule.pendingConfirmation') }}</span><b class="pending">{{ s.vipPackage.pendingHours }}</b></div>
            <div><span>{{ t('schedule.remaining') }}</span><b>{{ s.vipPackage.remaining }}</b></div>
          </div>
        </div>

        <div v-if="s.status !== 'CANCELLED'" class="record">
          <div class="record-head">
            <h4>{{ t('schedule.lessonRecord') }}</h4>
            <span class="spacer" />
            <el-button v-if="s.canEdit && !recEditing" link type="primary" icon="EditPen" @click="recEditing = true">{{
              s.record ? t('common.edit') : t('schedule.fillIn')
            }}</el-button>
          </div>
          <el-form v-if="recEditing" label-position="top" size="small">
            <el-form-item :label="t('schedule.lessonContent')" required><el-input
              v-model="rec.content"
              type="textarea"
              :rows="4"
              maxlength="5000"
              show-word-limit
            /></el-form-item>
            <el-form-item :label="t('schedule.homework')"><el-input v-model="rec.homework" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
            <el-form-item :label="t('schedule.classPerformance')">
            <el-input v-model="rec.performance" type="textarea" :rows="2" maxlength="2000" />
            </el-form-item>
            <el-form-item><el-checkbox v-model="rec.studentVisible">{{ t('schedule.visibleInStudentPortal') }}</el-checkbox></el-form-item>
            <div class="rec-btns">
              <el-button size="small" @click="recEditing = false">{{ t('common.cancel') }}</el-button>
              <el-button size="small" type="primary" :loading="recSaving" @click="saveRecord">{{ t('schedule.saveRecord') }}</el-button>
            </div>
          </el-form>
          <template v-else-if="s.record">
            <div class="rec-block"><label>{{ t('schedule.lessonContent') }}</label><p class="pre">{{ s.record.content }}</p></div>
            <div v-if="s.record.homework" class="rec-block"><label>{{ t('schedule.homework') }}</label><p class="pre">{{ s.record.homework }}</p></div>
            <div v-if="s.record.performance" class="rec-block">
            <label>{{ t('schedule.classPerformance') }}</label>
            <p class="pre">{{ s.record.performance }}</p>
            </div>
            <div class="muted">{{
              s.record.teacher?.name
            }} · {{
              fmtDateTime(s.record.updatedAt)
            }} · {{
              s.record.studentVisible ? t('schedule.visibleToStudents') : t('schedule.staffOnly')
            }}</div>
          </template>
          <el-empty v-else :description="t('schedule.noLessonRecord')" :image-size="60" />
        </div>
      </template>
    </div>

    <SessionDialog v-model="editVisible" :session="s" @saved="changed" />

    <el-dialog
      v-model="cancelVisible"
      :title="isConfirmed ? t('schedule.deleteConfirmedSession') : t('schedule.cancelSession')"
      width="min(440px, 94%)"
      append-to-body
    >
      <el-alert v-if="isConfirmed" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
        {{
          t('schedule.thisSessionIsConfirmedThisActionWill', { p0: s?.kind === 'VIP' ? t('schedule.deletingItReturnsHToTheRemaining', { p0: s?.hours }) : '' })
        }}
      </el-alert>
      <el-form label-position="top">
        <el-form-item v-if="s?.seriesId && !isConfirmed" :label="t('schedule.scope')">
          <el-radio-group v-model="cancelForm.scope">
            <el-radio value="one">{{ t('schedule.thisSessionOnly') }}</el-radio>
            <el-radio value="following">{{ t('schedule.thisAndFollowingSessions') }}</el-radio>
            <el-radio value="all">{{ t('schedule.allSessionsInThisSeries') }}</el-radio>
          </el-radio-group>
          <div class="muted">{{
            t('schedule.bulkCancellationOnlyAffectsUnconfirmedSessions', { p0: s?.kind === 'VIP' ? t('schedule.hoursAreAutomaticallyReturned') : '' })
          }}</div>
        </el-form-item>
        <el-form-item :label="t('schedule.reasonOptional')"><el-input
          v-model="cancelForm.reason"
          maxlength="500"
          :placeholder="t('schedule.eGStudentAbsencePublicHoliday')"
        /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelVisible = false">{{ t('common.back') }}</el-button>
        <el-button type="danger" :loading="busy" @click="doCancel">{{
          isConfirmed ? t('schedule.confirmDeletion') : t('schedule.confirmCancellation')
        }}</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.wrap { min-height: 200px; }
.hero { margin: -20px -20px 0; padding: 18px 20px 16px; background: var(--bg); border-bottom: 3px solid var(--c); }
.hero-top { display: flex; align-items: center; gap: 8px; }
.hero .spacer { flex: 1; }
.kind { color: #fff; background: var(--c); font-size: 12px; padding: 1px 8px; border-radius: 999px; }
.hero h3 { margin: 10px 0 4px; font-size: 18px; }
.when { color: var(--xh-text-2); }
.when b { color: var(--xh-text); font-variant-numeric: tabular-nums; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 0; border-bottom: 1px solid var(--xh-border); }
.actions .el-button { margin-left: 0; }
.desc { margin-top: 14px; }
.pre { white-space: pre-wrap; margin: 0; }
.ledger { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #f7f8fc; border: 1px solid var(--xh-border); }
.ledger-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.ledger-nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ledger-nums div { display: flex; flex-direction: column; }
.ledger-nums span { font-size: 12px; color: var(--xh-text-2); }
.ledger-nums b { font-size: 18px; font-variant-numeric: tabular-nums; }
.ledger-nums .used { color: var(--xh-teal); }
.ledger-nums .pending { color: var(--xh-kind-vip); }
.record { margin-top: 18px; }
.record-head { display: flex; align-items: center; }
.record-head h4 { margin: 0 0 8px; font-size: 15px; }
.record-head .spacer { flex: 1; }
.rec-block { margin-bottom: 10px; }
.rec-block label { font-size: 12px; color: var(--xh-text-2); }
.rec-block p { margin-top: 2px; line-height: 1.6; }
.rec-btns { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 767px) {
  .hero { margin: -20px -20px 0; padding-left: 16px; padding-right: 16px; }
  .actions .el-button { flex: 1 1 calc(50% - 4px); }
  .ledger-nums { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rec-btns .el-button { flex: 1; }
}
</style>
