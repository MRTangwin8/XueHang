<script setup lang="ts">
/**
 * 新建 / 编辑考试。新建时可选科目模板、关联班课（自动带入名单）、追加个别学员。
 * <AssessmentDialog v-model="show" :edit="row" @saved="reload" />
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import StudentSelect from '@/components/StudentSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useDialogWidth } from '@/utils/format'
import { today, toApi } from '@/utils/time'
import { fullMark, localName, useEdu } from '@/utils/edu'
import SubjectEditor from './SubjectEditor.vue'
import { gradesApi, type AssessmentBody, type AssessmentRow } from '../api'

const { t } = useI18n()
const props = defineProps<{ edit?: AssessmentRow | null }>()
const emit = defineEmits<{ saved: [id: number] }>()
const show = defineModel<boolean>({ required: true })
const auth = useAuth()
const dict = useDict()
const edu = useEdu()
const width = useDialogWidth('760px')
const formEl = ref<FormInstance>()
const saving = ref(false)
const classGroups = ref<{ id: number; name: string; campusId: number; status: string }[]>([])
const templateId = ref<string | null>(null)

const empty = (): AssessmentBody => ({
  name: '', kind: '', examDate: today(), campusId: auth.me?.campusId ?? null, classGroupId: null,
  conf: { subjects: [], totalMode: 'sum', scoreStep: 1 }, published: false, note: null, studentIds: [],
})
const form = ref<AssessmentBody>(empty())

watch(show, async (v) => {
  if (!v) return
  dict.load()
  templateId.value = null
  if (props.edit) {
    const e = props.edit
    form.value = { name: e.name, kind: e.kind, examDate: e.examDate.slice(0, 10), campusId: e.campusId, classGroupId: e.classGroupId,
      conf: structuredClone(e.conf), published: e.published, note: e.note }
  } else {
    form.value = empty()
    const first = edu.templates()[0]
    if (first) applyTemplate(first.id)
  }
  if (!classGroups.value.length) classGroups.value = await gradesApi.classGroups().catch(() => [])
})

function applyTemplate(id: string | null) {
  templateId.value = id
  const tp = edu.templates().find((x) => x.id === id)
  if (!tp) return
  form.value.conf = { subjects: tp.subjects.map((s) => ({ ...s, name: localName(s.name) })), totalMode: tp.totalMode, scoreStep: tp.scoreStep }
  if (!form.value.name) form.value.name = localName(tp.name)
}

const total = computed(() => fullMark(form.value.conf.subjects, form.value.conf.totalMode))
const rules = computed(() => ({
  name: [{ required: true, message: t('grades.dialog.nameRequired'), trigger: 'blur' }],
  kind: [{ required: true, message: t('grades.dialog.kindRequired'), trigger: 'change' }],
  examDate: [{ required: true, message: t('grades.dialog.dateRequired'), trigger: 'change' }],
  campusId: [{ required: true, message: t('students.messages.selectACampus'), trigger: 'change' }],
}))

async function save() {
  if (!(await formEl.value?.validate().catch(() => false))) return
  const subs = form.value.conf.subjects
  if (!subs.length) return ElMessage.warning(t('grades.dialog.needSubject'))
  if (subs.some((s) => !s.name.trim() || !s.key.trim())) return ElMessage.warning(t('grades.dialog.subjectIncomplete'))
  saving.value = true
  try {
    const body = { ...form.value, examDate: toApi(form.value.examDate) }
    if (props.edit) {
      await gradesApi.update(props.edit.id, body)
      emit('saved', props.edit.id)
    } else {
      const r = await gradesApi.create(body)
      emit('saved', r.id)
    }
    ElMessage.success(t('common.saved'))
    show.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="show" :title="edit ? t('grades.dialog.editTitle') : t('grades.dialog.createTitle')" :width="width" destroy-on-close>
    <el-form ref="formEl" :model="form" :rules="rules" label-position="top">
      <el-row :gutter="16">
        <el-col v-if="!edit" :xs="24">
          <el-form-item :label="t('grades.dialog.template')">
            <el-radio-group :model-value="templateId ?? undefined" @update:model-value="(v) => applyTemplate(v as string)">
              <el-radio-button v-for="tp in edu.templates()" :key="tp.id" :value="tp.id">{{ localName(tp.name) }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('grades.dialog.name')" prop="name"><el-input v-model="form.name" maxlength="60" /></el-form-item>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-form-item :label="t('grades.dialog.kind')" prop="kind"><DictSelect v-model="form.kind" dict="assessmentKinds" style="width: 100%" /></el-form-item>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-form-item :label="t('grades.dialog.date')" prop="examDate">
            <el-date-picker v-model="form.examDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('common.campus')" prop="campusId"><CampusSelect v-model="form.campusId" :clearable="false" style="width: 100%" /></el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('grades.dialog.classGroup')">
            <el-select v-model="form.classGroupId" clearable filterable :placeholder="t('grades.dialog.classGroupPh')" style="width: 100%">
              <el-option v-for="c in classGroups.filter((x) => !form.campusId || x.campusId === form.campusId)" :key="c.id" :value="c.id" :label="c.name" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col v-if="!edit" :xs="24">
          <el-form-item :label="t('grades.dialog.extraStudents')">
            <StudentSelect v-model="form.studentIds" multiple status="ENROLLED" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24">
          <el-form-item>
            <template #label>
              {{ t('grades.dialog.subjects') }}
              <span class="muted">（{{ t('grades.dialog.fullMark', { p1: total ?? '—' }) }}）</span>
            </template>
            <SubjectEditor v-model="form.conf.subjects" :step="form.conf.scoreStep" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item :label="t('grades.dialog.totalMode')">
            <el-radio-group v-model="form.conf.totalMode">
              <el-radio-button value="sum">{{ t('grades.totalMode.sum') }}</el-radio-button>
              <el-radio-button value="avg">{{ t('grades.totalMode.avg') }}</el-radio-button>
              <el-radio-button value="manual">{{ t('grades.totalMode.manual') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-form-item :label="t('grades.dialog.scoreStep')">
            <el-input-number v-model="form.conf.scoreStep" :min="0.01" :step="0.5" :controls="false" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-form-item :label="t('grades.dialog.publish')">
            <el-switch v-model="form.published" />
          </el-form-item>
        </el-col>
        <el-col :xs="24">
          <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" /></el-form-item>
        </el-col>
      </el-row>
      <el-alert v-if="edit" type="info" :closable="false" show-icon :title="t('grades.dialog.editHint')" />
    </el-form>
    <template #footer>
      <el-button @click="show = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>
