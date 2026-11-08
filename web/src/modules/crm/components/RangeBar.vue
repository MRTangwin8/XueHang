<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 统计区间选择：快捷（本周 / 本月 / 上月 / 近 30 天 / 今年）+ 自定义日期 + 校区 */
import CampusSelect from '@/components/CampusSelect.vue'
import { computed } from 'vue'
import { tz } from '@/utils/time'

const { t } = useI18n()

const range = defineModel<[string, string]>('range', { required: true })
const campusId = defineModel<number | null | undefined>('campusId')
defineProps<{ showCampus?: boolean }>()
const emit = defineEmits<{ change: [] }>()

const F = 'YYYY-MM-DD'
type Preset = { label: string; get: () => [string, string] }
const presets = computed<Preset[]>(() => [
  { label: t('crm.messages.thisWeek'), get: () => [tz().startOf('isoWeek').format(F), tz().format(F)] },
  { label: t('crm.messages.thisMonth'), get: () => [tz().startOf('month').format(F), tz().format(F)] },
  { label: t('crm.messages.lastMonth'), get: () => [tz().subtract(1, 'month').startOf('month').format(F), tz().subtract(1, 'month').endOf('month').format(F)] },
  { label: t('crm.messages.last30Days'), get: () => [tz().subtract(29, 'day').format(F), tz().format(F)] },
  { label: t('crm.messages.thisYear'), get: () => [tz().startOf('year').format(F), tz().format(F)] },
])
const isActive = (p: Preset) => {
  const [a, b] = p.get()
  return range.value?.[0] === a && range.value?.[1] === b
}
function pick(p: Preset) {
  range.value = p.get()
  emit('change')
}
</script>

<template>
  <div class="toolbar range-bar">
    <el-radio-group :model-value="presets.find(isActive)?.label ?? ''" size="default">
      <el-radio-button v-for="p in presets" :key="p.label" :value="p.label" @click="pick(p)">{{ p.label }}</el-radio-button>
    </el-radio-group>
    <el-date-picker
      v-model="range"
      type="daterange"
      value-format="YYYY-MM-DD"
      :range-separator="t('common.to')"
      :clearable="false"
      style="width: 250px"
      @change="emit('change')"
    />
    <CampusSelect v-if="showCampus" v-model="campusId" @change="emit('change')" />
    <span class="spacer" />
    <slot />
  </div>
</template>

<style scoped>
.range-bar .el-radio-group { flex-wrap: wrap; }
</style>
