<script setup lang="ts">
/**
 * 系统设置 → 成绩与档案设置：
 *   行业模板（一键导入）/ 考试类型（学员档案成绩）/ 成绩模板（成绩管理新建考试）/ 档案字段（显示、必填、名称）
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDict } from '@/stores/dict'
import { useDialogWidth } from '@/utils/format'
import { FIELD_LABEL_KEYS, NO_REQUIRED, PROFILE_FIELDS, localName, type EduConfig, type ExamTypeDef, type GradeTemplate, type ProfileField } from '@/utils/edu'
import SubjectEditor from '../components/SubjectEditor.vue'
import { gradesApi, type PresetSummary } from '../api'

const { t } = useI18n()
const dict = useDict()
const tab = ref('presets')
const conf = ref<EduConfig | null>(null)
const defaults = ref<EduConfig | null>(null)
const inUse = ref<string[]>([])
const presets = ref<PresetSummary[]>([])
const loading = ref(false)
const saving = ref(false)
const dlgWidth = useDialogWidth('560px')

async function load() {
  loading.value = true
  try {
    const [c, p] = await Promise.all([gradesApi.config(), gradesApi.presets()])
    conf.value = structuredClone(c.config)
    defaults.value = c.defaults
    inUse.value = c.inUse
    presets.value = p
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function save() {
  if (!conf.value) return
  for (const e of conf.value.examTypes) {
    if (!e.code.trim() || !e.name.trim()) return ElMessage.warning(t('grades.settings.examIncomplete'))
    if (e.subjects.some((s) => !s.key.trim() || !s.name.trim())) return ElMessage.warning(t('grades.dialog.subjectIncomplete'))
  }
  for (const g of conf.value.gradeTemplates) {
    if (!g.id.trim() || !g.name.trim() || !g.subjects.length) return ElMessage.warning(t('grades.settings.templateIncomplete'))
    if (g.subjects.some((s) => !s.key.trim() || !s.name.trim())) return ElMessage.warning(t('grades.dialog.subjectIncomplete'))
  }
  saving.value = true
  try {
    conf.value = structuredClone(await gradesApi.saveConfig(conf.value))
    ElMessage.success(t('common.saved'))
    dict.load(true)
  } finally {
    saving.value = false
  }
}

// ---------- 行业模板 ----------
const PARTS = ['exams', 'grades', 'profile', 'dicts', 'subjects'] as const
const applyDlg = ref(false)
const applyTarget = ref<PresetSummary | null>(null)
const parts = ref<string[]>([...PARTS])
const applying = ref(false)
function openApply(p: PresetSummary) {
  applyTarget.value = p
  parts.value = [...PARTS]
  applyDlg.value = true
}
async function doApply() {
  if (!applyTarget.value || !parts.value.length) return
  applying.value = true
  try {
    await gradesApi.applyPreset(applyTarget.value.id, parts.value)
    ElMessage.success(t('grades.settings.applied', { p1: localName(applyTarget.value.name) }))
    applyDlg.value = false
    await Promise.all([load(), dict.load(true)])
  } finally {
    applying.value = false
  }
}
const hiddenFields = (p: PresetSummary) => Object.entries(p.profileFields).filter(([, v]) => v?.hidden).map(([k]) => fieldDefault(k as ProfileField))
const renamed = (p: PresetSummary) => Object.entries(p.profileFields).filter(([, v]) => v?.label).map(([k, v]) => `${fieldDefault(k as ProfileField)} → ${localName(v!.label)}`)

// ---------- 考试类型 ----------
const months = Array.from({ length: 12 }, (_, i) => i + 1)
function addExam() {
  conf.value!.examTypes.push({ code: '', name: '', group: '', levels: [], scoreMax: null, scoreStep: 1, subjects: [], totalMode: 'sum', maxAttempts: 1, months: [], hidden: false })
}
function moveItem<T>(arr: T[], i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
async function removeExam(i: number, e: ExamTypeDef) {
  if (inUse.value.includes(e.code)) return ElMessage.warning(t('grades.settings.inUse'))
  await ElMessageBox.confirm(t('common.confirmDelete', { name: e.name || e.code }), t('common.confirmTitle'), { type: 'warning' })
  conf.value!.examTypes.splice(i, 1)
}
const examGroups = computed(() => [...new Set((conf.value?.examTypes ?? []).map((e) => e.group).filter(Boolean))])

// ---------- 成绩模板 ----------
function addTemplate() {
  const n = conf.value!.gradeTemplates.length + 1
  conf.value!.gradeTemplates.push({ id: `tpl${n}`, name: '', subjects: [{ key: 'score', name: '', max: 100 }], totalMode: 'sum', scoreStep: 1 })
}
async function removeTemplate(i: number, g: GradeTemplate) {
  await ElMessageBox.confirm(t('common.confirmDelete', { name: g.name || g.id }), t('common.confirmTitle'), { type: 'warning' })
  conf.value!.gradeTemplates.splice(i, 1)
}

// ---------- 档案字段 ----------
const fieldDefault = (f: ProfileField) => t(FIELD_LABEL_KEYS[f])
const fieldRows = PROFILE_FIELDS.map((f) => f) as unknown as Record<string, unknown>[]
function fieldConf(f: ProfileField) {
  const pf = conf.value!.profileFields
  return (pf[f] ??= {})
}

async function resetDefaults() {
  await ElMessageBox.confirm(t('grades.settings.resetConfirm'), t('common.confirmTitle'), { type: 'warning' })
  if (defaults.value) {
    const used = conf.value!.examTypes.filter((e) => inUse.value.includes(e.code) && !defaults.value!.examTypes.some((d) => d.code === e.code))
    conf.value = { ...structuredClone(defaults.value), examTypes: [...structuredClone(defaults.value.examTypes), ...used.map((e) => ({ ...e, hidden: true }))] }
  }
}
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="page-head">
      <h2>{{ t('grades.menu.settings') }}</h2>
      <span class="spacer" />
      <template v-if="tab !== 'presets'">
        <el-button @click="resetDefaults">{{ t('grades.settings.resetDefaults') }}</el-button>
        <el-button type="primary" icon="Check" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </div>
    <div v-if="conf" class="page-card">
      <el-tabs v-model="tab">
        <!-- 行业模板 -->
        <el-tab-pane :label="t('grades.settings.presets')" name="presets">
          <p class="muted intro">{{ t('grades.settings.presetsIntro') }}</p>
          <div class="preset-grid">
            <div v-for="p in presets" :key="p.id" :class="['preset', conf.preset === p.id && 'current']">
              <div class="p-head">
                <b>{{ localName(p.name) }}</b>
                <el-tag v-if="conf.preset === p.id" size="small" type="success" disable-transitions>{{ t('grades.settings.current') }}</el-tag>
              </div>
              <p class="muted">{{ localName(p.description) }}</p>
              <dl>
                <dt>{{ t('grades.settings.examTypes') }}</dt>
                <dd>{{ p.examTypes.map(localName).join(t('grades.settings.sep')) }}</dd>
                <dt>{{ t('grades.settings.templates') }}</dt>
                <dd>{{ p.gradeTemplates.map(localName).join(t('grades.settings.sep')) }}</dd>
                <dt v-if="p.dicts.educations">{{ fieldDefault('education') }}</dt>
                <dd v-if="p.dicts.educations">{{ p.dicts.educations.slice(0, 8).map((v) => dict.tr('educations', v)).join(t('grades.settings.sep')) }}{{ p.dicts.educations.length > 8 ? '…' : '' }}</dd>
                <dt>{{ t('grades.settings.teachingSubjects') }}</dt>
                <dd>{{ Object.values(p.subjects).flat().slice(0, 10).join(t('grades.settings.sep')) }}…</dd>
                <dt v-if="renamed(p).length">{{ t('grades.settings.renamedFields') }}</dt>
                <dd v-if="renamed(p).length">{{ renamed(p).join(t('grades.settings.sep')) }}</dd>
                <dt v-if="hiddenFields(p).length">{{ t('grades.settings.hiddenFields') }}</dt>
                <dd v-if="hiddenFields(p).length">{{ hiddenFields(p).join(t('grades.settings.sep')) }}</dd>
              </dl>
              <el-button type="primary" plain icon="Download" @click="openApply(p)">{{ t('grades.settings.import') }}</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 考试类型 -->
        <el-tab-pane :label="t('grades.settings.examTypes')" name="exams">
          <p class="muted intro">{{ t('grades.settings.examTypesIntro') }}</p>
          <div v-for="(e, i) in conf.examTypes" :key="i" :class="['cfg-card', e.hidden && 'is-hidden']">
            <div class="cfg-head">
              <b>{{ localName(e.name) || t('grades.settings.newExam') }}</b>
              <el-tag v-if="inUse.includes(e.code)" size="small" effect="plain" disable-transitions>{{ t('grades.settings.hasData') }}</el-tag>
              <span class="spacer" />
              <el-checkbox v-model="e.hidden">{{ t('grades.subject.hidden') }}</el-checkbox>
              <el-button link icon="Top" :disabled="i === 0" @click="moveItem(conf.examTypes, i, -1)" />
              <el-button link icon="Bottom" :disabled="i === conf.examTypes.length - 1" @click="moveItem(conf.examTypes, i, 1)" />
              <el-button link type="danger" icon="Delete" @click="removeExam(i, e)" />
            </div>
            <el-form label-position="top" class="cfg-form">
              <el-row :gutter="12">
                <el-col :xs="12" :sm="6" :md="4">
                  <el-form-item :label="t('grades.settings.code')">
                    <el-input v-model="e.code" maxlength="30" :disabled="inUse.includes(e.code)" />
                  </el-form-item>
                </el-col>
                <el-col :xs="12" :sm="9" :md="6">
                  <el-form-item :label="t('grades.subject.name')"><el-input v-model="e.name" maxlength="40" :placeholder="localName(e.name)" /></el-form-item>
                </el-col>
                <el-col :xs="12" :sm="9" :md="4">
                  <el-form-item :label="t('grades.settings.group')">
                    <el-select v-model="e.group" filterable allow-create default-first-option clearable style="width: 100%">
                      <el-option v-for="g in examGroups" :key="g" :value="g" :label="localName(g)" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="12" :sm="8" :md="4">
                  <el-form-item :label="t('grades.settings.maxAttempts')">
                    <el-input-number v-model="e.maxAttempts" :min="1" :max="20" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="12" :sm="8" :md="3">
                  <el-form-item :label="t('grades.settings.scoreMax')">
                    <el-input-number v-model="e.scoreMax" :min="0" :controls="false" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="12" :sm="8" :md="3">
                  <el-form-item :label="t('grades.dialog.scoreStep')">
                    <el-input-number v-model="e.scoreStep" :min="0.01" :step="0.5" :controls="false" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :md="10">
                  <el-form-item :label="t('grades.settings.levels')">
                    <el-select v-model="e.levels" multiple filterable allow-create default-first-option :placeholder="t('grades.settings.levelsPh')" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :md="14">
                  <el-form-item :label="t('grades.settings.months')">
                    <el-checkbox-group v-model="e.months" size="small">
                      <el-checkbox-button v-for="m in months" :key="m" :value="m">{{ m }}</el-checkbox-button>
                    </el-checkbox-group>
                  </el-form-item>
                </el-col>
                <el-col :xs="24">
                  <el-form-item :label="t('grades.settings.subjectsOptional')">
                    <SubjectEditor v-model="e.subjects" :step="e.scoreStep" show-highlight show-hidden />
                  </el-form-item>
                </el-col>
                <el-col v-if="e.subjects.length" :xs="24">
                  <el-form-item :label="t('grades.dialog.totalMode')">
                    <el-radio-group v-model="e.totalMode" size="small">
                      <el-radio-button value="sum">{{ t('grades.totalMode.sum') }}</el-radio-button>
                      <el-radio-button value="avg">{{ t('grades.totalMode.avg') }}</el-radio-button>
                      <el-radio-button value="manual">{{ t('grades.totalMode.manual') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </div>
          <el-button icon="Plus" type="primary" plain @click="addExam">{{ t('grades.settings.addExam') }}</el-button>
        </el-tab-pane>

        <!-- 成绩模板 -->
        <el-tab-pane :label="t('grades.settings.templates')" name="templates">
          <p class="muted intro">{{ t('grades.settings.templatesIntro') }}</p>
          <div v-for="(g, i) in conf.gradeTemplates" :key="i" class="cfg-card">
            <div class="cfg-head">
              <b>{{ localName(g.name) || t('grades.settings.newTemplate') }}</b>
              <span class="spacer" />
              <el-button link icon="Top" :disabled="i === 0" @click="moveItem(conf.gradeTemplates, i, -1)" />
              <el-button link icon="Bottom" :disabled="i === conf.gradeTemplates.length - 1" @click="moveItem(conf.gradeTemplates, i, 1)" />
              <el-button link type="danger" icon="Delete" @click="removeTemplate(i, g)" />
            </div>
            <el-form label-position="top" class="cfg-form">
              <el-row :gutter="12">
                <el-col :xs="12" :sm="6" :md="4"><el-form-item :label="t('grades.settings.code')"><el-input v-model="g.id" maxlength="30" /></el-form-item></el-col>
                <el-col :xs="12" :sm="9" :md="6"><el-form-item :label="t('grades.subject.name')"><el-input v-model="g.name" maxlength="40" /></el-form-item></el-col>
                <el-col :xs="16" :sm="9" :md="10">
                  <el-form-item :label="t('grades.dialog.totalMode')">
                    <el-radio-group v-model="g.totalMode" size="small">
                      <el-radio-button value="sum">{{ t('grades.totalMode.sum') }}</el-radio-button>
                      <el-radio-button value="avg">{{ t('grades.totalMode.avg') }}</el-radio-button>
                      <el-radio-button value="manual">{{ t('grades.totalMode.manual') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :xs="8" :sm="6" :md="4">
                  <el-form-item :label="t('grades.dialog.scoreStep')">
                    <el-input-number v-model="g.scoreStep" :min="0.01" :step="0.5" :controls="false" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24"><el-form-item :label="t('grades.dialog.subjects')"><SubjectEditor v-model="g.subjects" :step="g.scoreStep" /></el-form-item></el-col>
              </el-row>
            </el-form>
          </div>
          <el-button icon="Plus" type="primary" plain @click="addTemplate">{{ t('grades.settings.addTemplate') }}</el-button>
        </el-tab-pane>

        <!-- 档案字段 -->
        <el-tab-pane :label="t('grades.settings.fields')" name="fields">
          <p class="muted intro">{{ t('grades.settings.fieldsIntro') }}</p>
          <el-table :data="fieldRows" size="small">
            <el-table-column :label="t('grades.settings.defaultName')" min-width="140">
              <template #default="{ row }: any">{{ fieldDefault(row) }}</template>
            </el-table-column>
            <el-table-column :label="t('grades.settings.customName')" min-width="180">
              <template #default="{ row }: any">
                <el-input v-model="fieldConf(row).label" size="small" maxlength="30" clearable :placeholder="fieldDefault(row)" />
              </template>
            </el-table-column>
            <el-table-column :label="t('grades.settings.visible')" width="90" align="center">
              <template #default="{ row }: any">
                <el-switch :model-value="!fieldConf(row).hidden" size="small" @update:model-value="(v) => (fieldConf(row).hidden = !v)" />
              </template>
            </el-table-column>
            <el-table-column :label="t('grades.settings.required')" width="90" align="center">
              <template #default="{ row }: any">
                <el-switch v-if="!NO_REQUIRED.includes(row)" v-model="fieldConf(row).required" size="small" :disabled="fieldConf(row).hidden" />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="applyDlg" :title="t('grades.settings.importTitle', { p1: localName(applyTarget?.name) })" :width="dlgWidth">
      <el-checkbox-group v-model="parts" class="parts">
        <el-checkbox v-for="p in PARTS" :key="p" :value="p">{{ t(`grades.parts.${p}`) }}</el-checkbox>
      </el-checkbox-group>
      <el-alert type="info" :closable="false" show-icon :title="t('grades.settings.importNote')" style="margin-top: 12px" />
      <template #footer>
        <el-button @click="applyDlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="applying" :disabled="!parts.length" @click="doApply">{{ t('grades.settings.import') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.intro { margin: 0 0 12px; }
.preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.preset { border: 1px solid var(--xh-border); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.preset.current { border-color: var(--xh-primary); box-shadow: 0 0 0 3px var(--xh-primary-soft); }
.preset p { margin: 0; font-size: 13px; }
.p-head { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.preset dl { margin: 4px 0 8px; font-size: 12px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; flex: 1; align-content: start; }
.preset dt { color: var(--xh-text-2); white-space: nowrap; }
.preset dd { margin: 0; }
.preset .el-button { align-self: flex-start; }
.cfg-card { border: 1px solid var(--xh-border); border-radius: 12px; padding: 12px 14px 0; margin-bottom: 12px; }
.cfg-card.is-hidden { opacity: 0.65; }
.cfg-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cfg-head .spacer { flex: 1; }
.cfg-form :deep(.el-form-item) { margin-bottom: 12px; }
.parts { display: grid; gap: 6px; }
</style>
