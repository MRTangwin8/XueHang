<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 面谈 / 面试记录（结构化）：面试时长、日语、英语、文综、数学、志望校和专业、进学指导建议、其他 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { useDialogWidth } from '@/utils/format'
import { fmtDateTime } from '@/utils/time'
import StudentSelect from '@/components/StudentSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { interviewApi, type InterviewKind, type InterviewRecord, type Slot } from '../api'

const { t: tr } = useI18n()

/** 打开方式：record 编辑已有记录；slot 为某个时间段写记录；都没有则新建（可预选 studentId / kind） */
export interface RecordTarget {
  record?: InterviewRecord | null
  slot?: Slot | null
  studentId?: number | null
  kind?: InterviewKind
}
const props = defineProps<{ target: RecordTarget | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const auth = useAuth()
const dlgWidth = useDialogWidth('720px')
const saving = ref(false)

const form = reactive({
  studentId: null as number | null,
  teacherId: null as number | null,
  kind: 'CONSULT' as InterviewKind,
  heldAt: '' as string,
  durationMin: null as number | null,
  japanese: '',
  english: '',
  liberalArts: '',
  math: '',
  targetSchools: '',
  guidance: '',
  content: '',
})

watch(
  () => props.target,
  (t) => {
    if (!t) return
    const r = t.record
    Object.assign(form, {
      studentId: r?.studentId ?? t.slot?.studentId ?? t.studentId ?? null,
      teacherId: r?.teacherId ?? t.slot?.hostId ?? auth.me?.id ?? null,
      kind: r?.kind ?? t.slot?.kind ?? t.kind ?? 'CONSULT',
      heldAt: r?.heldAt ?? t.slot?.startAt ?? new Date().toISOString(),
      durationMin: r?.durationMin ?? (t.slot ? Math.round((+new Date(t.slot.endAt) - +new Date(t.slot.startAt)) / 60000) : null),
      japanese: r?.japanese ?? '',
      english: r?.english ?? '',
      liberalArts: r?.liberalArts ?? '',
      math: r?.math ?? '',
      targetSchools: r?.targetSchools ?? '',
      guidance: r?.guidance ?? '',
      content: r?.content ?? '',
    })
  },
)
const lockedStudent = computed(() => !!props.target?.slot || !!props.target?.record?.slotId)
const title = computed(() => {
  const k = form.kind === 'EXAM' ? tr('service.text.interview') : tr('service.text.consultation')
  return props.target?.record ? tr('service.text.editRecord', { v0: k }) : tr('service.text.addRecord', { v0: k })
})

async function save() {
  if (!form.studentId) return ElMessage.warning(tr('service.text.selectAStudent'))
  saving.value = true
  try {
    const body = {
      studentId: form.studentId,
      teacherId: form.teacherId || undefined,
      kind: form.kind,
      heldAt: form.heldAt,
      durationMin: form.durationMin,
      japanese: form.japanese,
      english: form.english,
      liberalArts: form.liberalArts,
      math: form.math,
      targetSchools: form.targetSchools,
      guidance: form.guidance,
      content: form.content,
    }
    if (props.target?.record) await interviewApi.updateRecord(props.target.record.id, body)
    else await interviewApi.createRecord({ ...body, slotId: props.target?.slot?.id ?? null })
    ElMessage.success(tr('service.text.recordSaved'))
    emit('saved')
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog :model-value="!!target" :title="title" :width="dlgWidth" :close-on-click-modal="false" @close="emit('close')">
    <div v-if="target?.slot" class="slot-info">
      <el-icon><Calendar /></el-icon> {{ target.slot.title }} · {{ fmtDateTime(target.slot.startAt) }} · {{ target.slot.student?.name }}
    </div>
    <el-form label-width="96px" class="rec-form">
      <div class="grid">
        <el-form-item :label="tr('service.text.student')" required>
          <StudentSelect v-model="form.studentId" :placeholder="lockedStudent ? '' : tr('service.text.searchStudents')" :class="{ locked: lockedStudent }" />
        </el-form-item>
        <el-form-item :label="tr('service.text.type')">
          <el-radio-group v-model="form.kind" :disabled="lockedStudent">
            <el-radio value="CONSULT">{{ tr('service.text.consultation') }}</el-radio>
            <el-radio value="EXAM">{{ tr('service.text.interview') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="tr('service.text.teacher')"><UserSelect v-model="form.teacherId" /></el-form-item>
        <el-form-item :label="tr('service.text.time')">
          <el-date-picker v-model="form.heldAt" type="datetime" format="YYYY-MM-DD HH:mm" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="tr('service.text.interviewDuration')">
          <el-input-number v-model="form.durationMin" :min="0" :max="600" :step="5" controls-position="right" style="width: 140px" />
          <span class="muted" style="margin-left: 6px">{{ tr('service.text.min') }}</span>
        </el-form-item>
      </div>
      <div class="grid">
        <el-form-item :label="tr('service.text.japanese')">
          <el-input v-model="form.japanese" type="textarea" :rows="2" :placeholder="tr('service.text.scoreProficiencyAssessment')" />
        </el-form-item>
        <el-form-item :label="tr('service.text.english')">
          <el-input v-model="form.english" type="textarea" :rows="2" :placeholder="tr('service.text.scoreProficiencyAssessment')" />
        </el-form-item>
        <el-form-item :label="tr('service.text.humanities')"><el-input v-model="form.liberalArts" type="textarea" :rows="2" /></el-form-item>
        <el-form-item :label="tr('service.text.mathematics')"><el-input v-model="form.math" type="textarea" :rows="2" /></el-form-item>
      </div>
      <el-form-item :label="tr('service.text.targetInstitutionsAndMajors')">
        <el-input
          v-model="form.targetSchools"
          type="textarea"
          :rows="2"
          :placeholder="tr('service.text.eGWasedaUniversityGraduateSchoolOfEconomicsHitotsubashi')" />
      </el-form-item>
      <el-form-item :label="tr('service.text.admissionsGuidance')"><el-input v-model="form.guidance" type="textarea" :rows="3" /></el-form-item>
      <el-form-item :label="tr('service.text.other')"><el-input v-model="form.content" type="textarea" :rows="2" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('close')">{{ tr('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ tr('service.text.saveRecord') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.slot-info { margin: -8px 0 14px; padding: 8px 12px; background: var(--xh-primary-soft); color: var(--xh-primary); border-radius: 8px; display: flex; align-items: center; gap: 6px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
.locked { pointer-events: none; opacity: 0.85; }
.rec-form :deep(.el-select) { width: 100%; }
@media (max-width: 767px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
