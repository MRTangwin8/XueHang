<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教学服务 · 面谈预约 / 面试预约（同一组件，kind=CONSULT / EXAM）。?studentId= 预选学生代约 / 写记录 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/http'
import { fmtTime, toApi, tz } from '@/utils/time'
import { useDialogWidth } from '@/utils/format'
import UserSelect from '@/components/UserSelect.vue'
import StudentSelect from '@/components/StudentSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { interviewApi, type InterviewKind, type Slot } from '../api'
import SlotBatchDialog from '../components/SlotBatchDialog.vue'
import RecordDialog, { type RecordTarget } from '../components/RecordDialog.vue'

const { t: tr } = useI18n()

const props = defineProps<{ kind: InterviewKind }>()
const route = useRoute()
const router = useRouter()
const kindName = computed(() => (props.kind === 'EXAM' ? tr('service.text.interview') : tr('service.text.consultation')))
const dlgWidth = useDialogWidth('460px')

const num = (v: unknown) => (v ? Number(v) : null)
const q = reactive({
  range: (route.query.from && route.query.to ? [String(route.query.from), String(route.query.to)] : [tz().format('YYYY-MM-DD'), tz(
    ).add(30, 'day').format('YYYY-MM-DD')]) as [string, string] | null,
  hostId: num(route.query.hostId),
  status: (route.query.status as string) || null,
  page: Number(route.query.page) || 1,
  pageSize: 200,
})
/** 预选学生（来自学员页「面谈」入口） */
const presetStudentId = ref<number | null>(num(route.query.studentId))
const presetStudent = ref<{ id: number; name: string; studentNo: string } | null>(null)

const items = ref<Slot[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({})
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await interviewApi.slots({
      kind: props.kind,
      from: q.range?.[0] ? toApi(q.range[0]) : undefined,
      to: q.range?.[1] ? toApi(q.range[1]) : undefined,
      hostId: q.hostId || undefined,
      status: q.status || undefined,
      page: q.page,
      pageSize: q.pageSize,
    })
    items.value = r.items
    total.value = r.total
    counts.value = r.counts
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({
    query: {
      from: q.range?.[0],
      to: q.range?.[1],
      hostId: q.hostId || undefined,
      status: q.status || undefined,
      studentId: presetStudentId.value || undefined,
      page: q.page > 1 ? String(q.page) : undefined,
    },
  })
  load()
}
function search() {
  q.page = 1
  sync()
}
async function loadPreset() {
  if (!presetStudentId.value) return (presetStudent.value = null)
  const r = await api.get<{ id: number; name: string; studentNo: string }[]>('/common/students', { ids: String(presetStudentId.value) })
  presetStudent.value = r[0] ?? null
}
function clearPreset() {
  presetStudentId.value = null
  presetStudent.value = null
  sync()
}

const days = computed(() => {
  const m = new Map<string, Slot[]>()
  for (const s of items.value) {
    const d = tz(s.startAt).format('YYYY-MM-DD')
    m.set(d, [...(m.get(d) ?? []), s])
  }
  return [...m.entries()].map(([date, slots]) => ({ date, slots }))
})
const dayTitle = (d: string) => {
  const t = tz(d)
  const diff = t.startOf('day').diff(tz().startOf('day'), 'day')
  const rel = diff === 0 ? tr('common.today') : diff === 1 ? tr('service.text.tomorrow') : diff === 2 ? tr('service.text.dayAfterTomorrow') : ''
  return { main: t.format(tr('service.text.mmmD')), sub: `${t.format('ddd')}${rel ? ' · ' + rel : ''}` }
}
const isPast = (s: Slot) => +new Date(s.endAt) < Date.now()

// ---- 代约 ----
const bookSlot = ref<Slot | null>(null)
const bookForm = reactive({ studentId: null as number | null, note: '' })
function openBook(s: Slot) {
  bookSlot.value = s
  bookForm.studentId = presetStudentId.value
  bookForm.note = ''
}
async function doBook() {
  if (!bookForm.studentId) return ElMessage.warning(tr('service.text.selectAStudent'))
  await interviewApi.book(bookSlot.value!.id, bookForm.studentId, bookForm.note || undefined)
  ElMessage.success(tr('service.text.bookingConfirmedAndStudentNotified'))
  bookSlot.value = null
  load()
}
async function cancelBooking(s: Slot) {
  await ElMessageBox.confirm(tr('service.text.cancelSBookingAtTheSlotWillBecomeAvailable', { v0: s.student?.name, v1: tz(
    s.startAt).format(tr('service.text.mmmDHhMm')), v2: kindName.value }), tr('service.text.cancelBooking'), { type: 'warning' })
  await interviewApi.cancelBooking(s.id)
  ElMessage.success(tr('service.text.bookingCancelled'))
  load()
}
async function remove(s: Slot) {
  const booked = s.status === 'BOOKED'
  await ElMessageBox.confirm(
    booked ? tr('service.text.thisSlotIsBookedByDeletingItCancelsThe', { v0: s.student?.name }) : tr('service.text.deleteThisTimeSlot'),
    booked ? tr('service.text.cancelAndDelete') : tr('service.text.deleteTimeSlot'),
    { type: 'warning' },
  )
  await interviewApi.remove(s.id)
  ElMessage.success(booked ? tr('service.text.bookingCancelled') : tr('common.deleted'))
  load()
}

// ---- 记录 ----
const recTarget = ref<RecordTarget | null>(null)
function openRecord(s: Slot) {
  if (s.record) router.push({ path: '/service/interview-records', query: { studentId: s.studentId ?? undefined } })
  else recTarget.value = { slot: s }
}
function newRecord() {
  recTarget.value = { studentId: presetStudentId.value, kind: props.kind }
}

const showBatch = ref(false)
onMounted(() => {
  load()
  loadPreset()
})
watch(
  () => props.kind,
  () => {
    q.page = 1
    load()
  },
)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.bookings', { kind: kindName }) }}</h2>
      <span class="spacer" />
      <el-button icon="EditPen" @click="newRecord">{{ tr('service.text.addRecord3', { kind: kindName }) }}</el-button>
      <el-button type="primary" icon="Plus" @click="showBatch = true">{{ tr('service.text.publishTimeSlots') }}</el-button>
    </div>

    <el-alert v-if="presetStudent" type="success" :closable="false" class="preset" show-icon>
      <template #title>
        <i18n-t keypath="service.text.arrangeAForClickBookForStudentOnAn" scope="global">
          <template #student><b>{{ presetStudent.name }}（{{ presetStudent.studentNo }}）</b></template>
          <template #kind>{{ kindName }}</template>
        </i18n-t>
        <el-button link type="primary" @click="clearPreset">{{ tr('service.text.clearSelection') }}</el-button>
      </template>
    </el-alert>

    <div class="stat-grid">
      <div class="stat"><div class="stat-label">{{ tr('service.text.available') }}</div><div class="stat-value text-success">{{ counts.OPEN ?? 0 }}</div></div>
      <div class="stat">
        <div class="stat-label">{{ tr('service.text.booked') }}</div>
        <div class="stat-value" style="color: #d97706">{{ counts.BOOKED ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">{{ tr('service.text.completed') }}</div>
        <div class="stat-value" style="color: var(--xh-primary)">{{ counts.DONE ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">{{ tr('service.text.cancelled') }}</div>
        <div class="stat-value" style="color: #94a3b8">{{ counts.CANCELLED ?? 0 }}</div>
      </div>
    </div>

    <div class="page-card">
      <div class="toolbar">
        <el-date-picker
          v-model="q.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          :range-separator="tr('common.to')"
          :start-placeholder="tr('service.text.start')"
          :end-placeholder="tr('service.text.end')"
          style="width: 260px"
          @change="search" />
        <UserSelect v-model="q.hostId" :placeholder="tr('service.text.allHosts')" @change="search" />
        <DictSelect v-model="q.status" dict="slotStatuses" :placeholder="tr('service.text.allStatuses')" @change="search" />
      </div>

      <div v-loading="loading">
        <el-empty v-if="!days.length" :description="tr('service.text.noSlotsInThisRangeClickPublishTimeSlots', { v0: kindName })" />
        <div v-for="d in days" :key="d.date" class="day">
          <div class="day-head">
            <span class="day-main">{{ dayTitle(d.date).main }}</span>
            <span class="day-sub">{{ dayTitle(d.date).sub }}</span>
            <span class="muted">{{ tr('service.text.slotsBooked2', {
              total: d.slots.length,
              booked: d.slots.filter((s) => s.status === 'BOOKED' || s.status === 'DONE').length,
            }) }}</span>
          </div>
          <div class="slots">
            <div v-for="s in d.slots" :key="s.id" class="slot" :class="['st-' + s.status.toLowerCase(), { past: isPast(s) }]">
              <div class="slot-top">
                <span class="slot-time">{{ fmtTime(s.startAt) }}–{{ fmtTime(s.endAt) }}</span>
                <DictTag dict="slotStatuses" :value="s.status" />
              </div>
              <div class="slot-who">
                <template v-if="s.student"><el-icon><User /></el-icon><b>{{ s.student.name }}</b><span class="muted">{{ s.student.studentNo }}</span></template>
                <span v-else class="muted">{{ tr('service.text.notBookedYet') }}</span>
              </div>
              <div class="slot-meta">
                <span>{{ s.host.name }}</span>
                <span>· {{ s.online ? tr('service.text.online') : s.location || tr('service.text.locationNotSet') }}</span>
              </div>
              <div v-if="s.bookingNote" class="slot-note">{{ tr('service.text.notes') }}{{ s.bookingNote }}</div>
              <div class="slot-ops">
                <el-button v-if="s.status === 'OPEN' && !isPast(s)" size="small" type="primary" plain @click="openBook(s)">
                  {{ tr('service.text.bookForStudent') }}
                </el-button>
                <el-button v-if="s.status === 'BOOKED' || s.status === 'DONE'" size="small" type="primary" link @click="openRecord(s)">
                  {{ s.record ? tr('service.text.viewRecord') : tr('service.text.addRecord2') }}
                </el-button>
                <el-button v-if="s.status === 'BOOKED' && !s.record" size="small" link @click="cancelBooking(s)">
                  {{ tr('service.text.cancelBooking') }}
                </el-button>
                <el-button v-if="!s.record" size="small" link type="danger" @click="remove(s)">{{ tr('common.delete') }}</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="total > q.pageSize" class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="sync" />
      </div>
    </div>

    <el-dialog :model-value="!!bookSlot" :title="tr('service.text.bookForStudent2', { v0: kindName })" :width="dlgWidth" @close="bookSlot = null">
      <template v-if="bookSlot">
        <p class="muted" style="margin-top: -6px">
          {{ bookSlot.title }} ·
          {{ tz(bookSlot.startAt).format(tr('service.text.mmmDHhMm')) }}–
          {{ fmtTime(bookSlot.endAt) }} ·
          {{ bookSlot.host.name }}
        </p>
        <el-form label-width="60px">
          <el-form-item :label="tr('service.text.student')" required>
            <StudentSelect v-model="bookForm.studentId" status="ENROLLED" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="tr('common.remark')"><el-input v-model="bookForm.note" :placeholder="tr('service.text.optional')" /></el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="bookSlot = null">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" @click="doBook">{{ tr('service.text.confirmBooking2') }}</el-button>
      </template>
    </el-dialog>

    <SlotBatchDialog v-model="showBatch" :kind="kind" @created="load" />
    <RecordDialog :target="recTarget" @close="recTarget = null" @saved="load" />
  </div>
</template>

<style scoped>
.preset { margin-bottom: 14px; }
.day { margin-bottom: 18px; }
.day-head { display: flex; align-items: baseline; gap: 10px; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px solid var(--xh-border); }
.day-main { font-size: 17px; font-weight: 700; }
.day-sub { color: var(--xh-primary); font-weight: 600; font-size: 13px; }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.slot { border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px 12px; background: #fff; border-left-width: 4px; display: flex; flex-direction: column; gap: 4px; }
.slot.st-open { border-left-color: #10b981; }
.slot.st-booked { border-left-color: #f59e0b; background: #fffbeb; }
.slot.st-done { border-left-color: var(--xh-primary); background: var(--xh-primary-soft); }
.slot.st-cancelled { border-left-color: #cbd5e1; opacity: 0.7; }
.slot.past { opacity: 0.65; }
.slot-top { display: flex; justify-content: space-between; align-items: center; }
.slot-time { font-weight: 700; font-size: 15px; }
.slot-who { display: flex; align-items: center; gap: 6px; min-height: 22px; }
.slot-meta { font-size: 12px; color: var(--xh-text-2); }
.slot-note { font-size: 12px; color: #92400e; }
.slot-ops { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.slot-ops .el-button + .el-button { margin-left: 0; }
@media (max-width: 767px) {
  .slots { grid-template-columns: 1fr; }
}
</style>
