<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 考试场次选择：JLPT 每年 7月 / 12月，EJU 每年 6月 / 11月。
 * 值仍是 'YYYY-MM-DD'（取当月 1 日），兼容已有的具体日期数据（按年月匹配）。
 * <ExamSessionSelect v-model="form.examDate" :months="[7, 12]" />
 */
import { computed } from 'vue'
import { tz } from '@/utils/time'
import { examSessionLabel } from '../api'

const { t } = useI18n()

const props = withDefaults(defineProps<{ months: number[]; pastYears?: number; futureYears?: number; placeholder?: string; size?: 'small' | 'default'
  | 'large' }>(), {
  pastYears: 6,
  futureYears: 1,
})
const model = defineModel<string | null | undefined>()

const options = computed(() => {
  const y = tz().year()
  const list: { value: string; label: string }[] = []
  for (let year = y + props.futureYears; year >= y - props.pastYears; year--) {
    for (const m of [...props.months].sort((a, b) => b - a)) {
      const value = `${year}-${String(m).padStart(2, '0')}`
      list.push({ value, label: examSessionLabel(value) })
    }
  }
  return list
})

/** 以「年-月」为键；旧数据若不在可选场次内也照常显示 */
const ym = computed<string | null>({
  get: () => (model.value ? model.value.slice(0, 7) : null),
  set: (v) => (model.value = v ? `${v}-01` : null),
})
const extra = computed(() => (ym.value && !options.value.some((o) => o.value === ym.value) ? ym.value : null))
</script>

<template>
  <el-select v-model="ym" clearable filterable :placeholder="placeholder ?? t('students.messages.examSession')" :size="size">
    <el-option v-if="extra" :value="extra" :label="examSessionLabel(extra)" />
    <el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label" />
  </el-select>
</template>
