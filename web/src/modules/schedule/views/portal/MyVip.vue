<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 学生端 · 我的课时：课时包账本 + 课次列表 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fmtDateTime, fmtMonthDay } from '@/utils/time'
import { portalApi, type PortalPackage, type PortalSession } from '../../api'
import { CONFIRMED_BY, timeRange } from '../../utils'
import HoursBar from '../../components/HoursBar.vue'

const { t } = useI18n()

const pkgs = ref<PortalPackage[]>([])
const autoHours = ref(0)
const autoConfirmEnabled = ref(false)
const studentCanConfirm = ref(true)
const loading = ref(false)
const expanded = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    const r = await portalApi.vip()
    pkgs.value = r.packages
    autoHours.value = r.autoConfirmHours
    autoConfirmEnabled.value = r.autoConfirmEnabled
    studentCanConfirm.value = r.studentCanConfirm
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function confirm(s: PortalSession) {
  try {
    await ElMessageBox.confirm(t('schedule.confirmTheLessonOnHasBeenCompleted', { p0: fmtMonthDay(s.startAt), p1: timeRange(s), p2: s.hours }),
      t('schedule.confirmHours'), { type: 'info', confirmButtonText: t('common.confirmTitle') })
  } catch {
    return
  }
  await portalApi.confirm(s.id)
  ElMessage.success(t('schedule.confirmedThankYou'))
  load()
}
const statusText = (s: PortalSession) =>
  s.status === 'CONFIRMED' ? CONFIRMED_BY[s.confirmedBy ?? ''] ?? t('schedule.confirmed') : !studentCanConfirm.value ?
    t('schedule.teacherConfirmsHours') : s.canConfirm ? t('schedule.pendingConfirmation') : t('schedule.notStarted')
</script>

<template>
  <div v-loading="loading" class="my-vip">
    <el-alert v-if="autoConfirmEnabled" type="info" :closable="false" show-icon class="tip">
      {{ t('schedule.afterYourLessonClickConfirmHoursUnconfirmed', { p0: autoHours }) }}
    </el-alert>

    <div v-for="p in pkgs" :key="p.id" class="pkg">
      <div class="pkg-head">
        <div>
          <h3>{{ p.name }}</h3>
          <div class="muted">{{
            p.subject
          }}<template v-if="p.teachers.length"> · {{
            p.teachers.map((t) => t.name).join(t('schedule.listSeparator'))
          }}</template>
          </div>
        </div>
        <el-tag :type="p.status === 'ACTIVE' ? 'success' : 'info'" size="small" disable-transitions>{{
          p.status === 'ACTIVE' ? t('schedule.enrolled') : t('schedule.completed')
        }}</el-tag>
      </div>
      <div class="nums">
        <div><span>{{ t('schedule.totalHours') }}</span><b>{{ p.totalHours }}</b></div>
        <div><span>{{ t('schedule.confirmed') }}</span><b class="u">{{ p.usedHours }}</b></div>
        <div><span>{{ t('schedule.pendingConfirmation') }}</span><b class="p">{{ p.pendingHours }}</b></div>
        <div><span>{{ t('schedule.remaining') }}</span><b>{{ p.remaining }}</b></div>
      </div>
      <HoursBar :total="p.totalHours" :used="p.usedHours" :pending="p.pendingHours" :show-text="false" />

      <div class="sessions">
        <div v-for="s in (expanded === p.id ? p.sessions : p.sessions.slice(0, 6))" :key="s.id" class="sess" :class="{ todo: s.canConfirm }">
          <div class="s-main">
            <div><b>{{ fmtMonthDay(s.startAt) }}</b> {{ timeRange(s) }} <span class="muted">· {{ s.hours }}h</span></div>
            <div class="muted">{{ s.room?.name }}<template v-if="s.teacher"> · {{ s.teacher.name }}</template></div>
            <div v-if="autoConfirmEnabled && s.autoConfirmAt" class="auto">{{ t('schedule.automaticallyConfirmsOn', { p0: fmtDateTime(s.autoConfirmAt) }) }}</div>
            <details v-if="s.record" class="rec">
              <summary>{{ t('schedule.lessonRecord') }}</summary>
              <p>{{ s.record.content }}</p>
              <p v-if="s.record.homework"><b>{{ t('schedule.homeworkLabel') }}</b>{{ s.record.homework }}</p>
              <p v-if="s.record.performance"><b>{{ t('schedule.performance') }}</b>{{ s.record.performance }}</p>
            </details>
          </div>
          <el-button v-if="studentCanConfirm && s.canConfirm" type="primary" size="small" @click="confirm(s)">{{ t('schedule.confirmHours') }}</el-button>
          <span v-else class="state" :class="s.status">{{ statusText(s) }}</span>
        </div>
        <el-button v-if="p.sessions.length > 6" link type="primary" @click="expanded = expanded === p.id ? null : p.id">
          {{ expanded === p.id ? t('schedule.collapse') : t('schedule.viewAllSessions', { p0: p.sessions.length }) }}
        </el-button>
        <el-empty v-if="!p.sessions.length" :description="t('schedule.noSessions')" :image-size="60" />
      </div>
    </div>
    <el-empty v-if="!pkgs.length && !loading" :description="t('schedule.noVipLessonPackages')" />
  </div>
</template>

<style scoped>
.my-vip { display: flex; flex-direction: column; gap: 14px; }
.tip { border-radius: 10px; }
.pkg { background: #fff; border: 1px solid var(--xh-border); border-radius: var(--xh-radius); box-shadow: var(--xh-shadow); padding: 16px; }
.pkg-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.pkg-head h3 { margin: 0 0 2px; font-size: 16px; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 10px; }
.nums div { display: flex; flex-direction: column; }
.nums span { font-size: 12px; color: var(--xh-text-2); }
.nums b { font-size: 20px; font-variant-numeric: tabular-nums; }
.nums .u { color: var(--xh-teal); }
.nums .p { color: var(--xh-kind-vip); }
.sessions { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.sess { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #f7f8fc; }
.sess.todo { background: var(--xh-kind-vip-bg); }
.s-main { flex: 1; min-width: 0; }
.auto { font-size: 12px; color: var(--xh-kind-vip); margin-top: 2px; }
.state { font-size: 12px; color: var(--xh-text-2); white-space: nowrap; }
.state.CONFIRMED { color: var(--xh-teal); }
.rec { margin-top: 6px; font-size: 13px; }
.rec summary { cursor: pointer; color: var(--xh-primary); }
.rec p { margin: 4px 0; white-space: pre-wrap; }
</style>
