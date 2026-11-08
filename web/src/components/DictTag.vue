<script setup lang="ts">
/** 字典值显示为彩色标签。<DictTag dict="orderStatuses" :value="row.status" /> */
import { computed } from 'vue'
import { useDict } from '@/stores/dict'

const props = defineProps<{ dict: string; value?: string | null; size?: 'small' | 'default' | 'large' }>()
const d = useDict()
const opt = computed(() => d.find(props.dict, props.value))
const type = computed(() => {
  const c = opt.value?.color
  return c && ['primary', 'success', 'warning', 'danger', 'info'].includes(c) ? (c as 'primary') : undefined
})
const color = computed(() => (opt.value?.color?.startsWith('#') ? opt.value.color : undefined))
</script>

<template>
  <el-tag v-if="value" :type="type" :color="color" :style="color ? 'color:#fff;border:none' : ''" :size="size ?? 'small'" disable-transitions>
    {{ opt?.label ?? value }}
  </el-tag>
</template>
