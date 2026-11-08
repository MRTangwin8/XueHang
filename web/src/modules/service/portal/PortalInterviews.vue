<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDict } from '@/stores/dict'
import { fmtDateTime, fmtTime, tz } from '@/utils/time'
import DictTag from '@/components/DictTag.vue'
import { portalApi, type InterviewKind, type PortalBooking, type PortalRecord } from '../api'
import PortalSurface from './components/PortalSurface.vue'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const dict = useDict()
const kind = computed<InterviewKind>(() => route.query.kind === 'EXAM' ? 'EXAM' : 'CONSULT')
const days = ref<Awaited<ReturnType<typeof portalApi.slots>>['days']>([])
const bookings = ref<PortalBooking[]>([])
const records = ref<PortalRecord[]>([])
const loading = ref(false)
const failed = ref(false)
const busy = ref(false)
const now = ref(Date.now())
const cancelHours = computed(() => dict.rules?.interviewCancelLockHours ?? 8)
const cancelHint = computed(() => tr('service.text.bookingsCannotBeCancelledWithin8HoursOfThe', { hours: cancelHours.value }))
const confirmText = computed(() => dict.rules?.interviewConfirmText.trim()
  || tr('service.interview.confirmText', { hours: cancelHours.value }))
let serial = 0
const timer = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onBeforeUnmount(() => {
  clearInterval(timer)
  serial++
})
async function load() {
  const request = ++serial
  loading.value = true
  failed.value = false
  try {
    const [available, mine] = await Promise.all([portalApi.slots(kind.value), portalApi.interviews()])
    if (request !== serial)
      return
    days.value = available.days
    bookings.value = mine.bookings
    records.value = mine.records
  } catch {
    if (request === serial)
      failed.value = true
  } finally {
    if (request === serial)
      loading.value = false
  }
}
function canCancel(b: PortalBooking) {
  return b.canCancel && tz(b.cancelLockAt).valueOf() > now.value
}
async function book(id: number) {
  if (busy.value)
    return
  busy.value = true
  try {
    await dict.load()
    if (!dict.rules)
      return
    try {
      await ElMessageBox.confirm(confirmText.value, tr('service.text.confirmBooking'), {
        confirmButtonText: tr('service.text.bookNow'),
        cancelButtonText: tr('service.text.goBack'),
      })
    } catch {
      return
    }
    await portalApi.book(id)
    ElMessage.success(tr('service.text.bookingConfirmed'))
    await load()
  } catch {
    await load()
  } finally {
    busy.value = false
  }
}
async function cancel(b: PortalBooking) {
  if (busy.value || !canCancel(b))
    return
  busy.value = true
  try {
    try {
      await ElMessageBox.confirm(tr('service.text.cancelThisBooking'), tr('service.text.cancelBooking'), { type: 'warning' })
    } catch {
      return
    }
    await portalApi.cancel(b.id)
    ElMessage.success(tr('service.text.bookingCancelled'))
    await load()
  } catch {
    await load()
  } finally {
    busy.value = false
  }
}
const fields = computed(() => [
  { key: 'japanese', label: tr('service.text.japanese') },
  { key: 'english', label: tr('service.text.english') },
  { key: 'liberalArts', label: tr('service.text.humanities') },
  { key: 'math', label: tr('service.text.mathematics') },
  { key: 'targetSchools', label: tr('service.text.targetInstitutionsAndMajors') },
  { key: 'guidance', label: tr('service.text.admissionsGuidance') }
] as const)
watch(kind, load)
onMounted(load)
</script>

<template>
  <div class="page">
    <PortalSurface>
      <div class="page-head">
        <h2>{{ tr('service.text.consultationInterviewBookings') }}</h2>
        <span class="spacer" />
        <el-radio-group
          :model-value="kind"
          size="large"
          @update:model-value="value => router.replace({ query: { ...route.query, kind: String(value) } })"
        >
          <el-radio-button value="CONSULT">{{ tr('service.text.consultation') }}</el-radio-button>
          <el-radio-button value="EXAM">{{ tr('service.text.interview') }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-alert :title="cancelHint" type="warning" :closable="false" show-icon />
      <el-alert v-if="failed" :title="tr('service.text.couldNotLoadBookingData')" type="error" :closable="false">
        <el-button link @click="load">{{ tr('service.text.retry') }}</el-button>
      </el-alert>
      <div v-loading="loading">
        <section class="page-card">
          <h3 class="page-title">{{ tr('service.text.availableTimeSlots') }}</h3>
          <div v-for="day in days" :key="day.date" class="day">
            <h4>{{ day.date }}
              ·
              {{ tz(day.date).format('ddd') }}</h4>
            <div class="card-grid">
              <article v-for="s in day.items" :key="s.id" class="item-card">
                <h4>{{ s.title }}</h4>
                <p class="accent">{{ fmtTime(s.startAt) }}
                  –
                  {{ fmtTime(s.endAt) }}</p>
                <p class="meta">
                  {{ s.host.name }}
                  ·
                  {{ s.online ? tr('service.text.online') : tr('service.text.inPerson') }}
                  <br>
                  {{ s.campus?.name }}
                  {{ s.location }}
                </p>
                <el-button type="primary" class="submit-button" :disabled="busy" @click="book(s.id)">{{ tr('service.text.book') }}</el-button>
              </article>
            </div>
          </div>
          <el-empty v-if="!loading && !days.length" :description="tr('service.text.noTimeSlotsAvailable')" />
        </section>
        <section class="page-card">
          <h3 class="page-title">{{ tr('service.text.myBookings') }}</h3>
          <div class="card-grid">
            <article v-for="b in bookings.filter(b => b.kind === kind)" :key="b.id" class="item-card">
              <div class="row">
                <h4>{{ b.title }}</h4>
                <DictTag dict="slotStatuses" :value="b.status" />
              </div>
              <p>{{ fmtDateTime(b.startAt) }}
                –
                {{ fmtTime(b.endAt) }}</p>
              <p class="meta">
                {{ b.host.name }}
                ·
                {{ b.online ? tr('service.text.online') : b.location || b.campus?.name || tr('service.text.locationToBeAnnounced') }}
              </p>
              <p v-if="b.bookingNote" class="meta preserve">{{ tr('service.text.bookingNotes') }}
                {{ b.bookingNote }}</p>
              <el-button :disabled="busy || !canCancel(b)" @click="cancel(b)">{{ tr('service.text.cancelBooking') }}</el-button>
              <p v-if="!canCancel(b) && b.status === 'BOOKED'" class="meta">{{ cancelHint }}</p>
            </article>
          </div>
          <el-empty v-if="!loading && !bookings.some(b => b.kind === kind)" :description="tr('service.text.noBookings')" :image-size="60" />
        </section>
        <section class="page-card">
          <h3 class="page-title">{{ tr('service.text.records2', {
            kind: kind === 'EXAM' ? tr('service.text.interview') : tr('service.text.consultation'),
          }) }}</h3>
          <div class="stack">
            <article v-for="r in records.filter(r => r.kind === kind)" :key="r.id" class="item-card">
              <h4>{{ fmtDateTime(r.heldAt) }}
                ·
                {{ r.teacher.name }}</h4>
              <p class="meta">{{ tr('service.text.duration') }}
                {{ r.durationMin == null ? tr('service.text.notProvided') : r.durationMin + tr('service.text.min2') }}</p>
              <dl>
                <template v-for="field in fields" :key="field.key">
                  <dt>{{ field.label }}</dt>
                  <dd class="preserve">{{ r[field.key] || tr('service.text.notProvided') }}</dd>
                </template>
              </dl>
            </article>
          </div>
          <el-empty v-if="!loading && !records.some(r => r.kind === kind)" :description="tr('service.text.noRecordsAvailable')" :image-size="60" />
        </section>
      </div>
    </PortalSurface>
  </div>
</template>

<style scoped>
.day + .day {
  margin-top: 24px;
}
dt {
  color: var(--xh-text-2);
  margin-top: 12px;
  font-size: 13px;
}
dd {
  margin: 5px 0 0;
  line-height: 1.8;
}
</style>
