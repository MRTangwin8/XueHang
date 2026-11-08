<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * 字典下拉。dict 为 server/src/dict.ts 中 DICTS 的 key。
 * <DictSelect v-model="form.education" dict="educations" />
 * <DictSelect v-model="form.weekdays" dict="weekdays" multiple />
 * radio 模式：<DictSelect v-model="form.classMode" dict="classModes" radio />
 */
import { computed } from 'vue'
import { useDict } from '@/stores/dict'

const { t } = useI18n()

const props = defineProps<{ dict: string; multiple?: boolean; radio?: boolean; placeholder?: string; clearable?: boolean; exclude?: string[] }>()
const model = defineModel<string | string[] | null | undefined>()
const d = useDict()
// 已隐藏的选项不再提供，但当前值若是隐藏项仍保留显示
const opts = computed(() => d.options(props.dict, model.value as string | string[] | null).filter((o) => !props.exclude?.includes(o.value)))
</script>

<template>
  <el-radio-group v-if="radio" v-model="model as string">
    <el-radio v-for="o in opts" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
  </el-radio-group>
  <el-select v-else v-model="model" :multiple="multiple" filterable :clearable="clearable !== false" :placeholder="placeholder ?? t('common.pleaseSelect')">
    <el-option v-for="o in opts" :key="o.value" :value="o.value" :label="o.label" />
  </el-select>
</template>
