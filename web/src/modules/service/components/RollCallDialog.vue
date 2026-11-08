<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 点名表：班级全部学生 + 出勤状态 / 备注 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDict } from '@/stores/dict'
import { fmtDate, fmtTime, tz } from '@/utils/time'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { attendanceApi, type SheetRow } from '../api'

const { t: tr } = useI18n()

const props = defineProps<{ sessionId: number | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const dict = useDict()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('820px')

type Sheet = Awaited<ReturnType<typeof attendanceApi.sheet>>
const sheet = ref<Sheet | null>(null)
const rows = ref<(SheetRow & { status: string | null })[]>([])
const loading = ref(false)
const saving = ref(false)
const statuses = computed(() => dict.options('attendanceStatuses'))

const COLORS: Record<string, string> = { PRESENT: '#059669', ABSENT: '#dc2626', LEAVE: '#64748b', LATE: '#d97706', EARLY_LEAVE: '#ea580c' }

watch(
  () => props.sessionId,
  async (id) => {
    if (!id) return (sheet.value = null)
    loading.value = true
    try {
      sheet.value = await attendanceApi.sheet(id)
      rows.value = sheet.value.students.map((s) => ({ ...s }))
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const r of rows.value) if (r.status) c[r.status] = (c[r.status] ?? 0) + 1
  return c
})
const unset = computed(() => rows.value.filter((r) => !r.status).length)

function setAll(status: string) {
  rows.value.forEach((r) => {
    if (!r.status || status === 'PRESENT') r.status = status
  })
}

async function save() {
  const records = rows.value.filter((r) => r.status).map((r) => ({ studentId: r.id, status: r.status!, note: r.note || null }))
  if (!records.length) return ElMessage.warning(tr('service.text.selectAttendanceStatusesFirst'))
  saving.value = true
  try {
    await attendanceApi.save(props.sessionId!, records)
    ElMessage.success(unset.value ? tr('service.text.savedStudentsStillUnmarked', { v0: records.length, v1: unset.value }) : tr('service.text.attendanceSaved'))
    emit('saved')
    emit('close')
  } finally {
    saving.value = false
  }
}
const title = computed(() => {
  const s = sheet.value?.session
  if (!s) return tr('service.text.takeAttendance')
  return tr('service.text.attendance', { v0: s.classGroup?.name ?? s.title })
})
</script>

<template>
  <el-dialog :model-value="!!sessionId" :title="title" :width="dlgWidth" :fullscreen="isMobile" :close-on-click-modal="false" @close="emit('close')">
    <div v-loading="loading">
      <template v-if="sheet">
        <div class="info">
          <span>
            <el-icon><Calendar /></el-icon>
            {{ fmtDate(sheet.session.startAt) }}
            {{ tz(sheet.session.startAt).format('ddd') }}
            {{ fmtTime(sheet.session.startAt) }}-
            {{ fmtTime(sheet.session.endAt) }}
          </span>
          <span v-if="sheet.session.room"><el-icon><Location /></el-icon>{{ sheet.session.room.name }}</span>
          <span v-if="sheet.session.teacher"><el-icon><User /></el-icon>{{ sheet.session.teacher.name }}</span>
        </div>
        <div class="bar">
          <span class="muted">{{ tr('service.text.studentsInTotal', { n: rows.length }) }}</span>
          <span v-for="o in statuses" :key="o.value" class="cnt" :style="{ color: COLORS[o.value] }">{{ o.label }} {{ counts[o.value] ?? 0 }}</span>
          <span v-if="unset" class="cnt text-danger">{{ tr('service.text.unmarked') }} {{ unset }}</span>
          <span class="spacer" />
          <el-button size="small" type="success" plain @click="setAll('PRESENT')">{{ tr('service.text.markAllPresent') }}</el-button>
        </div>
        <el-empty v-if="!rows.length" :description="tr('service.text.thisClassHasNoStudentsAddStudentsToThe')" />
        <div v-for="r in rows" :key="r.id" class="stu" :class="{ unset: !r.status }">
          <div class="who">
            <div class="name">{{ r.name }}</div>
            <div class="muted">{{ r.studentNo }}</div>
          </div>
          <div class="ctrl">
            <div class="opts">
              <button
                v-for="o in statuses"
                :key="o.value"
                type="button"
                class="opt"
                :class="{ on: r.status === o.value }"
                :style="r.status === o.value ? { background: COLORS[o.value], borderColor: COLORS[o.value] } : { color: COLORS[o.value] }"
                @click="r.status = o.value"
              >
                {{ o.label }}
              </button>
            </div>
            <el-input v-model="r.note" size="small" :placeholder="tr('service.text.teacherNotesOptional')" clearable class="note" />
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="emit('close')">{{ tr('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="!rows.length" @click="save">{{ tr('service.text.saveAttendance') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.info { display: flex; flex-wrap: wrap; gap: 16px; color: var(--xh-text-2); margin: -6px 0 12px; }
.info span { display: inline-flex; align-items: center; gap: 4px; }
.bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 10px 12px; background: #f7f8fc; border-radius: 8px; margin-bottom: 8px; font-size: 13px; }
.bar .spacer { flex: 1; }
.cnt { font-weight: 600; }
.stu { display: flex; align-items: center; gap: 12px; padding: 10px 4px; border-bottom: 1px solid var(--xh-border); }
.stu.unset .name::after { content: ' ·未点'; color: var(--el-color-danger); font-size: 12px; font-weight: 400; }
.who { width: 120px; flex-shrink: 0; }
.name { font-weight: 600; }
.ctrl { flex: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.opts { display: flex; gap: 6px; flex-wrap: wrap; }
.opt { border: 1px solid var(--xh-border); background: #fff; border-radius: 16px; padding: 4px 12px; font-size: 13px; cursor: pointer; transition: all 0.12s; font-weight: 500; }
.opt:hover { border-color: currentColor; }
.opt.on { color: #fff !important; }
.note { flex: 1; min-width: 160px; }
@media (max-width: 767px) {
  .stu { flex-direction: column; align-items: stretch; gap: 6px; }
  .who { width: auto; display: flex; gap: 8px; align-items: baseline; }
  .opt { padding: 6px 12px; }
}
</style>
