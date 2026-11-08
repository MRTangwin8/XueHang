<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 学员档案表单（新建报名 / 编辑共用）。
 * <StudentForm ref="formRef" v-model="form" />   formRef.value.validate() → Promise<boolean>
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { api } from '@/api/http'
import { useDict } from '@/stores/dict'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import ExamFields from './ExamFields.vue'
import { PROFILE_FIELDS, useEdu, type ProfileField } from '@/utils/edu'
import { emptyAdmission, studentsApi, type StudentFormModel } from '../api'

const { t } = useI18n()
const edu = useEdu()

defineProps<{ showSales?: boolean }>()
const form = defineModel<StudentFormModel>({ required: true })
const dict = useDict()
const formEl = ref<FormInstance>()

const maxAdm = computed(() => dict.rules?.maxAdmissions ?? 5)

const channels = ref<{ id: number; name: string }[]>([])
const orgs = ref<{ id: number; name: string; type: string | null }[]>([])
onMounted(async () => {
  dict.load()
  const [c, o] = await Promise.all([
    api.get<{ id: number; name: string }[]>('/common/channels').catch(() => []),
    api.get<{ id: number; name: string; type: string | null }[]>('/common/organizations').catch(() => []),
  ])
  channels.value = c
  orgs.value = o
})

/** 档案字段 → 表单属性 */
const PROP: Partial<Record<ProfileField, string>> = { channel: 'channelId', organization: 'organizationId', emergency: 'emergencyName' }
const prop = (f: ProfileField) => PROP[f] ?? f

const rules = computed<FormRules>(() => {
  const r: FormRules = {
    name: [{ required: true, message: t('students.messages.enterAName'), trigger: 'blur' }],
    campusId: [{ required: true, message: t('students.messages.selectACampus'), trigger: 'change' }],
  }
  for (const f of PROFILE_FIELDS)
    if (edu.required(f)) r[prop(f)] = [{ required: true, whitespace: true, message: t('grades.form.fieldRequired', { p1: edu.label(f) }), trigger: 'change' }]
  return r
})

function addAdmission() {
  if (form.value.admissions.length >= maxAdm.value) return ElMessage.warning(t('students.messages.youCanEnterUpToAdmissions', { p1: maxAdm.value }))
  form.value.admissions.push(emptyAdmission())
}

async function searchUni(q: string, cb: (items: { value: string }[]) => void) {
  try {
    const list = await studentsApi.universities(q ?? '')
    cb(list.map((value) => ({ value })))
  } catch {
    cb([])
  }
}

async function validate(): Promise<boolean> {
  const ok = await formEl.value?.validate().catch(() => false)
  if (!ok) {
    ElMessage.warning(t('students.messages.completeTheRequiredFields'))
    return false
  }
  const bad = form.value.admissions.findIndex((a) => !a.university?.trim())
  if (bad >= 0) {
    ElMessage.warning(t('students.messages.enterTheInstitutionNameForAdmissionOr', { p1: bad + 1 }))
    return false
  }
  return true
}
defineExpose({ validate })
</script>

<template>
  <el-form ref="formEl" :model="form" :rules="rules" label-position="top" scroll-to-error class="student-form">
    <!-- ============ 基本信息 ============ -->
    <section class="sf-section">
      <h4 class="sf-title"><el-icon><User /></el-icon>{{ t('students.messages.basicInformation') }}</h4>
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item :label="t('profile.name')" prop="name">
            <el-input v-model="form.name" maxlength="40" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('nameAlt')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('nameAlt')" :prop="prop('nameAlt')">
            <el-input v-model="form.nameAlt" maxlength="60" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('gender')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('gender')"><DictSelect v-model="form.gender" dict="genders" radio /></el-form-item>
        </el-col>
        <el-col v-if="edu.show('birthday')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('birthday')" :prop="prop('birthday')">
            <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('phone')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('phone')" :prop="prop('phone')">
            <el-input v-model="form.phone" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('phoneCn')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('phoneCn')" :prop="prop('phoneCn')">
            <el-input v-model="form.phoneCn" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('wechat')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('wechat')" :prop="prop('wechat')">
            <el-input v-model="form.wechat" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('email')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('email')" :prop="prop('email')">
            <el-input v-model="form.email" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('qq')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('qq')" :prop="prop('qq')">
            <el-input v-model="form.qq" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('address')" :xs="24" :sm="12" :md="16">
          <el-form-item :label="edu.label('address')" :prop="prop('address')">
            <el-input v-model="form.address" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('visaStatus')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('visaStatus')" :prop="prop('visaStatus')">
            <DictSelect v-model="form.visaStatus" dict="visaStatuses" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('emergency')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('emergency')" :prop="prop('emergency')">
            <el-input v-model="form.emergencyName" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('emergency')" :xs="12" :sm="12" :md="8">
          <el-form-item :label="t('students.messages.relationship')">
            <el-input v-model="form.emergencyRelation" :placeholder="t('students.messages.eGFather')" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('emergency')" :xs="12" :sm="12" :md="8">
          <el-form-item :label="t('students.messages.emergencyPhone')">
            <el-input v-model="form.emergencyPhone" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('arrivedAt')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('arrivedAt')" :prop="prop('arrivedAt')">
            <el-date-picker v-model="form.arrivedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('enrollTerm')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('enrollTerm')" :prop="prop('enrollTerm')">
            <el-input v-model="form.enrollTerm" :placeholder="t('students.messages.eGApr')" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item :label="t('common.campus')" prop="campusId">
            <CampusSelect v-model="form.campusId" :placeholder="t('students.messages.selectCampus')" :clearable="false" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('channel')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('channel')" :prop="prop('channel')">
            <el-select v-model="form.channelId" clearable filterable :placeholder="t('students.messages.selectSource')" style="width: 100%">
              <el-option v-for="c in channels" :key="c.id" :value="c.id" :label="c.name" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('organization')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('organization')" :prop="prop('organization')">
            <el-select v-model="form.organizationId" clearable filterable :placeholder="t('students.messages.selectPartnerOrganization')" style="width: 100%">
              <el-option v-for="o in orgs" :key="o.id" :value="o.id" :label="o.name" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
    </section>
    <!-- ============ 院校信息 ============ -->
    <section class="sf-section">
      <h4 class="sf-title"><el-icon><School /></el-icon>{{ t('students.messages.educationInformation') }}</h4>
      <el-row :gutter="16">
        <el-col v-if="edu.show('education')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('education')" :prop="prop('education')">
            <DictSelect v-model="form.education" dict="educations" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('graduatedSchool')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('graduatedSchool')" :prop="prop('graduatedSchool')">
            <el-input v-model="form.graduatedSchool" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('graduatedMajor')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('graduatedMajor')" :prop="prop('graduatedMajor')">
            <el-input v-model="form.graduatedMajor" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('graduatedAt')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('graduatedAt')" :prop="prop('graduatedAt')">
            <el-date-picker v-model="form.graduatedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('languageSchool')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('languageSchool')" :prop="prop('languageSchool')">
            <el-input v-model="form.languageSchool" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('subjectCategory')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('subjectCategory')" :prop="prop('subjectCategory')">
            <DictSelect v-model="form.subjectCategory" dict="subjectCategories" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('targetUniversity')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('targetUniversity')" :prop="prop('targetUniversity')">
            <el-input v-model="form.targetUniversity" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('targetMajor')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('targetMajor')" :prop="prop('targetMajor')">
            <el-input v-model="form.targetMajor" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('targetDegree')" :xs="24" :sm="12" :md="8">
          <el-form-item :label="edu.label('targetDegree')" :prop="prop('targetDegree')">
            <DictSelect v-model="form.targetDegree" dict="targetDegrees" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col v-if="edu.show('researchTheme')" :xs="24" :sm="24" :md="24">
          <el-form-item :label="edu.label('researchTheme')" :prop="prop('researchTheme')">
            <el-input v-model="form.researchTheme" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item :label="t('students.messages.assignedTeacher')">
            <UserSelect v-model="form.mainTeacherId" identity="TEACHER" :placeholder="t('students.messages.selectTeacher')" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item :label="t('students.messages.contractTeacher')">
            <UserSelect v-model="form.contractTeacherId" identity="TEACHER" :placeholder="t('students.messages.selectTeacher')" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item :label="t('students.messages.salesAdvisor')">
            <UserSelect v-model="form.salesId" :placeholder="t('select.staff')" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24"><el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item></el-col>
      </el-row>
    </section>
    <!-- ============ 成绩（按「成绩与档案设置」中的考试类型渲染） ============ -->
    <section v-if="edu.show('exams')" class="sf-section">
      <h4 class="sf-title"><el-icon><Medal /></el-icon>{{ edu.label('exams') }}</h4>
      <ExamFields v-model="form.exams" />
    </section>
    <!-- ============ 合格信息 ============ -->
    <section v-if="edu.show('admissions')" class="sf-section">
      <h4 class="sf-title"><el-icon><Trophy /></el-icon>{{ edu.label('admissions') }}</h4>
      <div class="sub-head">
        <span class="muted">{{ t('students.messages.upToInstitutionsEntered', { p1: maxAdm, p2: form.admissions.length }) }}</span>
        <span class="spacer" />
        <el-button size="small" type="primary" plain icon="Plus" :disabled="form.admissions.length >= maxAdm" @click="addAdmission">
          {{ t('students.messages.addAdmission') }}
        </el-button>
      </div>
      <div v-if="!form.admissions.length" class="muted empty-tip">{{ t('students.messages.noAdmissions') }}</div>
      <div v-for="(a, i) in form.admissions" :key="i" class="block-card">
        <div class="block-head">
          <strong>{{ t('students.messages.admission', { p1: i + 1 }) }}</strong>
          <span class="spacer" />
          <el-button link type="danger" icon="Delete" @click="form.admissions.splice(i, 1)" />
        </div>
        <el-row :gutter="12">
          <el-col :xs="24" :md="9">
            <el-form-item :label="t('students.messages.institution')" required>
              <el-autocomplete
                v-model="a.university"
                :fetch-suggestions="searchUni"
                :placeholder="t('students.messages.searchEGWasedaTokyo')"
                clearable
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8" :md="5">
            <el-form-item :label="t('students.messages.faculty')">
              <el-input v-model="a.faculty" :placeholder="t('students.messages.facultyGraduateSchool')" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8" :md="5"><el-form-item :label="t('students.messages.department')"><el-input v-model="a.department" /></el-form-item></el-col>
          <el-col :xs="24" :sm="8" :md="5"><el-form-item :label="t('students.messages.specialization')"><el-input v-model="a.major" /></el-form-item></el-col>
        </el-row>
      </div>
    </section>
  </el-form>
</template>

<style scoped>
.sf-section { padding: 4px 0 8px; }
.sf-section + .sf-section { border-top: 1px dashed var(--xh-border); padding-top: 16px; margin-top: 4px; }
.sf-title { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 15px; font-weight: 650; color: var(--xh-primary); }
.student-form :deep(.el-form-item) { margin-bottom: 14px; }
.sub-head { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; font-weight: 600; flex-wrap: wrap; }
.sub-head .spacer, .block-head .spacer { flex: 1; }
.empty-tip { padding: 8px 0 12px; }
.block-card { border: 1px solid var(--xh-border); background: #fafbff; border-radius: 10px; padding: 12px 14px 4px; margin-bottom: 12px; }
.block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
</style>
