<script setup lang="ts">
/**
 * 科目列表编辑：名称 / 满分 / 及格线（可选）/ 代码；可选「高亮」「隐藏」开关。
 * <SubjectEditor v-model="conf.subjects" :step="conf.scoreStep" show-hidden />
 */
import { useI18n } from 'vue-i18n'
import { localName, type SubjectDef } from '@/utils/edu'

const { t } = useI18n()
withDefaults(defineProps<{ step?: number; showHighlight?: boolean; showHidden?: boolean; lockedKeys?: string[] }>(), { step: 1, lockedKeys: () => [] })
const model = defineModel<SubjectDef[]>({ required: true })

function nextKey() {
  let i = model.value.length + 1
  while (model.value.some((s) => s.key === `s${i}`)) i++
  return `s${i}`
}
function add() {
  model.value.push({ key: nextKey(), name: '', max: 100, pass: null })
}
function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= model.value.length) return
  const arr = model.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
</script>

<template>
  <div class="subj-editor">
    <div class="se-head">
      <span class="c-name">{{ t('grades.subject.name') }}</span>
      <span class="c-num">{{ t('grades.subject.max') }}</span>
      <span class="c-num">{{ t('grades.subject.pass') }}</span>
      <span class="c-key">{{ t('grades.subject.key') }}</span>
      <span class="c-ops" />
    </div>
    <div v-for="(s, i) in model" :key="i" class="se-row">
      <el-input v-model="s.name" class="c-name" size="small" :placeholder="localName(s.name) || t('grades.subject.namePh')" maxlength="40" />
      <el-input-number v-model="s.max" class="c-num" size="small" :min="step" :step="step" :controls="false" />
      <el-input-number v-model="s.pass" class="c-num" size="small" :min="0" :max="s.max" :step="step" :controls="false" :placeholder="t('grades.subject.passPh')" />
      <el-input v-model="s.key" class="c-key" size="small" maxlength="30" :disabled="lockedKeys.includes(s.key)" />
      <span class="c-ops">
        <el-tooltip v-if="showHighlight" :content="t('grades.subject.highlightTip')" placement="top">
          <el-checkbox v-model="s.highlight" size="small">{{ t('grades.subject.highlight') }}</el-checkbox>
        </el-tooltip>
        <el-checkbox v-if="showHidden" v-model="s.hidden" size="small">{{ t('grades.subject.hidden') }}</el-checkbox>
        <el-button link icon="Top" :disabled="i === 0" @click="move(i, -1)" />
        <el-button link icon="Bottom" :disabled="i === model.length - 1" @click="move(i, 1)" />
        <el-button link type="danger" icon="Delete" @click="model.splice(i, 1)" />
      </span>
    </div>
    <el-button size="small" icon="Plus" plain type="primary" @click="add">{{ t('grades.subject.add') }}</el-button>
  </div>
</template>

<style scoped>
.subj-editor { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.se-head, .se-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.se-head { font-size: 12px; color: var(--xh-text-2); }
.c-name { width: 160px; }
.c-num { width: 90px !important; }
.c-key { width: 110px; }
.c-ops { display: flex; align-items: center; gap: 4px; }
.subj-editor > .el-button { align-self: flex-start; }
@media (max-width: 767px) {
  .se-head { display: none; }
  .se-row { padding: 8px; border: 1px solid var(--xh-border); border-radius: 8px; }
  .c-name { width: 100%; }
}
</style>
