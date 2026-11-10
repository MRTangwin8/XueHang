<script setup lang="ts">
import { useRoute } from 'vue-router'
import { currencyName, money } from '@/utils/format'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useDict } from '@/stores/dict'
import { rulesApi, type EditableDict, type ExtendedRules } from '../api'

const { t } = useI18n()
const dict = useDict()
const loading = ref(false)
const saving = ref(false)
const route = useRoute()
const active = ref(String(route.query.tab || 'vip'))
watch(() => route.query.tab, (v) => v && (active.value = String(v)))
const defaults = ref<ExtendedRules | null>(null)
const form = reactive<ExtendedRules>({} as ExtendedRules)
const dicts = ref<(EditableDict & { savedValues: string[]; newValue: string })[]>([])
const months = Array.from({ length: 12 }, (_, i) => i + 1)

const groups = [
  { name: 'vip', fields: ['vipAutoConfirmEnabled', 'vipAutoConfirmHours', 'vipStudentConfirm'] },
  { name: 'interview', fields: ['interviewCancelLockHours', 'interviewConfirmText'] },
  { name: 'document', fields: ['documentEditHours', 'documentMaxEdits', 'documentReturnDays', 'documentRulesText'] },
  { name: 'print', fields: ['printCurrency', 'printPriceBW', 'printPriceColor', 'printCutoff', 'printReadyTime', 'printGuideText'] },
  { name: 'money', fields: ['wageCurrency'] },
  { name: 'student', fields: ['maxAdmissions'] },
  { name: 'board', fields: ['boardStartHour', 'boardEndHour'] },
  { name: 'customer', fields: ['customerRecycleEnabled', 'customerRecycleDays'] },
  { name: 'numbering', fields: ['studentNoPrefix', 'orderNoPrefix', 'uploadMaxMB'] },
  { name: 'login', fields: ['loginMaxFailures', 'loginIpMaxFailures', 'loginLockMinutes', 'sessionDays'] },
  { name: 'demo', fields: ['readOnlyCanSchedule'] },
] as const

const specs: Record<string, { min?: number; max?: number; kind?: string }> = {
  vipAutoConfirmEnabled: { kind: 'switch' }, vipAutoConfirmHours: { min: 1, max: 720 }, vipStudentConfirm: { kind: 'switch' },
  interviewCancelLockHours: { min: 0, max: 168 }, interviewConfirmText: { kind: 'text' }, documentEditHours: { min: 0, max: 720 },
  documentMaxEdits: { min: 0, max: 10 }, documentReturnDays: { min: 1, max: 60 }, documentRulesText: { kind: 'text' },
  printPriceBW: { min: 0, max: 100000 }, printPriceColor: { min: 0, max: 100000 }, printCutoff: { kind: 'time' },
  printReadyTime: { kind: 'time' }, printGuideText: { kind: 'text' }, maxAdmissions: { min: 1, max: 20 },
  boardStartHour: { min: 0, max: 23 }, boardEndHour: { min: 1, max: 24 },
  customerRecycleEnabled: { kind: 'switch' }, customerRecycleDays: { min: 1, max: 365 }, studentNoPrefix: { kind: 'prefix' },
  orderNoPrefix: { kind: 'prefix' }, uploadMaxMB: { min: 1, max: 100 },
  loginMaxFailures: { min: 3, max: 20 }, loginIpMaxFailures: { min: 5, max: 200 }, loginLockMinutes: { min: 1, max: 1440 },
  sessionDays: { min: 1, max: 30 },
  printCurrency: { kind: 'currency' }, wageCurrency: { kind: 'currency' }, readOnlyCanSchedule: { kind: 'switch' },
}

const defaultText = (key: string) => {
  if (specs[key]?.kind === 'currency') return currencyName(String(defaults.value?.[key as keyof ExtendedRules] ?? 'JPY'))
  const value = defaults.value?.[key as keyof ExtendedRules]
  if (Array.isArray(value)) return value.map((m) => t('system.rules.month', { n: m })).join(', ')
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no')
  if (value === '') return t('system.rules.useLocalizedDefault')
  return String(value ?? '')
}

const customDefault = (key: string) => {
  const map: Record<string, string> = {
    documentRulesText: 'system.rules.defaultDocumentText', printGuideText: 'system.rules.defaultPrintText',
    interviewConfirmText: 'system.rules.defaultInterviewText',
  }
  return t(map[key], ruleParams.value)
}

const ruleParams = computed(() => ({
  hours: form.documentEditHours, days: form.documentReturnDays, times: form.documentMaxEdits,
  bw: money(form.printPriceBW, form.printCurrency), color: money(form.printPriceColor, form.printCurrency), cutoff: form.printCutoff, ready: form.printReadyTime,
  cancelHours: form.interviewCancelLockHours,
}))

const currentYear = new Date().getFullYear()
const numberPreview = (key: string) => key === 'studentNoPrefix'
  ? `${form.studentNoPrefix}${currentYear}001`
  : `${form.orderNoPrefix}${currentYear}000001`
const updatePrefix = (key: 'studentNoPrefix' | 'orderNoPrefix', value: string) => {
  form[key] = value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 10)
}

async function load() {
  loading.value = true
  try {
    const [rules, editable] = await Promise.all([rulesApi.get(), rulesApi.dicts()])
    Object.assign(form, structuredClone(rules.rules))
    defaults.value = rules.defaults
    dicts.value = editable.map((item) => ({ ...item, savedValues: [...item.values], newValue: '' }))
  } finally {
    loading.value = false
  }
}

async function saveRules() {
  if (form.boardEndHour <= form.boardStartHour) return ElMessage.warning(t('system.rules.boardRangeError'))
  saving.value = true
  try {
    const result = await rulesApi.save(form)
    Object.assign(form, structuredClone(result.rules))
    defaults.value = result.defaults
    await dict.load(true)
    ElMessage.success(t('system.rules.saved'))
  } finally {
    saving.value = false
  }
}

async function resetRules() {
  await ElMessageBox.confirm(t('system.rules.resetAllConfirm'), t('system.rules.confirmTitle'), { type: 'warning' })
  const result = await rulesApi.reset()
  Object.assign(form, structuredClone(result.rules))
  defaults.value = result.defaults
  await dict.load(true)
  ElMessage.success(t('system.rules.resetDone'))
}

function addValue(item: (typeof dicts.value)[number]) {
  const value = item.newValue.trim()
  if (!value) return
  if (item.values.includes(value)) return ElMessage.warning(t('system.rules.duplicateValue'))
  item.values.push(value)
  item.newValue = ''
}

function removeNew(item: (typeof dicts.value)[number], value: string) {
  item.values = item.values.filter((v) => v !== value)
}

function toggleHidden(item: (typeof dicts.value)[number], value: string) {
  item.hidden = item.hidden.includes(value) ? item.hidden.filter((v) => v !== value) : [...item.hidden, value]
}

async function saveDict(item: (typeof dicts.value)[number]) {
  if (item.hidden.length >= item.values.length) return ElMessage.warning(t('system.rules.keepOneVisible'))
  await rulesApi.saveDict(item.key, item.values, item.hidden)
  item.savedValues = [...item.values]
  await dict.load(true)
  ElMessage.success(t('system.rules.dictSaved'))
}

async function resetDict(item: (typeof dicts.value)[number]) {
  await ElMessageBox.confirm(t('system.rules.resetDictConfirm'), t('system.rules.confirmTitle'), { type: 'warning' })
  await rulesApi.resetDict(item.key)
  await Promise.all([load(), dict.load(true)])
  ElMessage.success(t('system.rules.resetDone'))
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page rules-page">
    <div class="page-card">
      <el-alert :title="t('system.rules.immediateHint')" type="info" :closable="false" show-icon />
      <el-tabs v-model="active" class="rules-tabs">
          <el-tab-pane
            v-for="group in groups"
            :key="group.name"
            :name="group.name"
            :label="t(`system.rules.groups.${group.name}`)"
          >
          <el-alert v-if="group.name === 'login'" :title="t('system.rules.newLoginHint')" type="warning" :closable="false" show-icon />
          <div class="rule-grid">
            <div v-for="key in group.fields" :key="key" class="rule-item">
              <div class="rule-label">{{ t(`system.rules.fields.${key}`) }}</div>
              <el-switch v-if="specs[key].kind === 'switch'" v-model="(form as any)[key]" />
              <el-input-number v-else-if="!specs[key].kind" v-model="(form as any)[key]" :min="specs[key].min" :max="specs[key].max"
                :disabled="(key === 'vipAutoConfirmHours' && !form.vipAutoConfirmEnabled)
                  || (key === 'customerRecycleDays' && !form.customerRecycleEnabled)" />
              <el-select v-else-if="specs[key].kind === 'currency'" v-model="(form as any)[key]" filterable allow-create default-first-option
                :placeholder="t('system.rules.currencyPh')" style="width: 220px">
                <el-option value="JPY" :label="currencyName('JPY')" />
                <el-option value="CNY" :label="currencyName('CNY')" />
              </el-select>
              <el-time-select v-else-if="specs[key].kind === 'time'" v-model="(form as any)[key]" start="00:00" step="00:15" end="23:45" />
              <el-checkbox-group v-else-if="specs[key].kind === 'months'" v-model="(form as any)[key]" class="month-grid">
                <el-checkbox-button v-for="month in months" :key="month" :value="month">{{ t('system.rules.month', { n: month }) }}</el-checkbox-button>
              </el-checkbox-group>
              <div v-else-if="specs[key].kind === 'prefix'" class="prefix-setting">
                <el-input :model-value="(form as any)[key]" maxlength="10" :placeholder="t('system.rules.prefixPlaceholder')"
                  @update:model-value="updatePrefix(key as 'studentNoPrefix' | 'orderNoPrefix', $event)" />
                <span>{{ t('system.rules.preview', { value: numberPreview(key) }) }}</span>
              </div>
              <div v-else class="text-setting">
                <el-input v-model="(form as any)[key]" type="textarea" :rows="5" :maxlength="key === 'interviewConfirmText' ? 200 : 3000"
                  show-word-limit :placeholder="t('system.rules.customPlaceholder')" />
                <el-button @click="(form as any)[key] = customDefault(key)">{{ t('system.rules.fillCurrentDefault') }}</el-button>
              </div>
              <div class="default-value">{{ t('system.rules.defaultValue', { value: defaultText(key) }) }}</div>
              <div v-if="group.name === 'customer' && key === 'customerRecycleDays'" class="field-hint">{{ t('system.rules.customerRecycleHint') }}</div>
              <div v-if="specs[key].kind === 'currency'" class="field-hint">{{ t('system.rules.currencyHint', { sample: money(1000, (form as any)[key]) }) }}</div>
              <div v-if="key === 'readOnlyCanSchedule'" class="field-hint">{{ t('system.rules.readOnlyScheduleHint') }}</div>
              <div v-if="group.name === 'numbering' && key === 'orderNoPrefix'" class="field-hint">{{ t('system.rules.numberingHint') }}</div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="dicts" :label="t('system.rules.groups.dicts')">
          <div class="dict-list">
            <section v-for="item in dicts" :key="item.key" class="dict-item">
              <div class="dict-head">
                <h3>{{ t(`system.dicts.${item.key}`) }}</h3>
                <div><el-button @click="resetDict(item)">{{ t('common.reset') }}</el-button><el-button type="primary" @click="saveDict(item)">{{ t('common.save') }}</el-button></div>
              </div>
              <div class="tags">
                <span v-for="value in item.values" :key="value" class="value-tag" :class="{ hidden: item.hidden.includes(value) }">
                  <span>{{ dict.label(item.key, value) }}</span>
                  <small v-if="item.hidden.includes(value)">{{ t('system.rules.hidden') }}</small>
                  <el-button v-if="item.savedValues.includes(value)" link type="primary" @click="toggleHidden(item, value)">
                    {{ item.hidden.includes(value) ? t('system.rules.restoreVisible') : t('system.rules.hide') }}
                  </el-button>
                  <el-button v-else link type="danger" @click="removeNew(item, value)">{{ t('common.delete') }}</el-button>
                </span>
              </div>
              <div class="add-value"><el-input v-model="item.newValue" :placeholder="t('system.rules.newValue')" maxlength="50" @keyup.enter="addValue(item)" />
                <el-button type="primary" plain @click="addValue(item)">{{ t('common.add') }}</el-button></div>
            </section>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <div class="page-actions"><el-button @click="resetRules">{{ t('system.rules.resetAll') }}</el-button>
      <el-button type="primary" :loading="saving" @click="saveRules">{{ t('common.save') }}</el-button></div>
  </div>
</template>

<style scoped>
.rules-page { padding-bottom: 76px; }
.rules-tabs { margin-top: 16px; }
.rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
.rule-item { padding: 16px; border: 1px solid var(--xh-border); border-radius: 8px; }
.rule-label { margin-bottom: 10px; font-weight: 600; }
.default-value { margin-top: 8px; color: var(--xh-text-2); font-size: 12px; white-space: pre-wrap; }
.text-setting { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.prefix-setting { display: flex; align-items: center; gap: 10px; }
.prefix-setting .el-input { max-width: 220px; }
.prefix-setting span, .field-hint { color: var(--xh-text-2); font-size: 12px; }
.field-hint { margin-top: 8px; line-height: 1.6; }
.month-grid { display: flex; flex-wrap: wrap; }
.dict-list { display: flex; flex-direction: column; gap: 16px; }
.dict-item { border-bottom: 1px solid var(--xh-border); padding-bottom: 16px; }
.dict-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dict-head h3 { margin: 0; font-size: 16px; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.value-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid var(--xh-border); border-radius: 6px; }
.value-tag.hidden { color: var(--xh-text-2); background: #f3f4f6; }
.value-tag small { color: var(--xh-text-2); }
.add-value { display: flex; gap: 8px; max-width: 460px; }
.page-actions { position: fixed; z-index: 10; right: 24px; bottom: 20px; display: flex; gap: 8px; padding: 10px; background: #fff;
  border: 1px solid var(--xh-border); border-radius: 8px; box-shadow: var(--xh-shadow); }
@media (max-width: 700px) {
  .rule-grid { grid-template-columns: 1fr; }
  .dict-head { align-items: flex-start; flex-direction: column; }
  .page-actions { right: 12px; bottom: 12px; }
}
</style>
