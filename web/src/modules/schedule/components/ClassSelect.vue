<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 班课选择（在读班级）。选中后通过 picked 抛出完整对象，便于预填老师 / 默认教室 */
import { onMounted, ref, watch } from 'vue'
import { scheduleApi, type ClassGroup } from '../api'

const { t } = useI18n()

const props = defineProps<{ campusId?: number | null; disabled?: boolean; includeFinished?: boolean }>()
const model = defineModel<number | null | undefined>()
const emit = defineEmits<{ picked: [cls: ClassGroup | null] }>()
const list = ref<ClassGroup[]>([])

async function load() {
  const r = await scheduleApi.classes({ campusId: props.campusId, status: props.includeFinished ? undefined : 'ACTIVE', pageSize: 500 })
  list.value = r.items
  emitPicked()
}
const emitPicked = () => emit('picked', list.value.find((c) => c.id === model.value) ?? null)
onMounted(load)
watch(() => props.campusId, load)
watch(model, emitPicked)
</script>

<template>
  <el-select v-model="model" filterable clearable :disabled="disabled" :placeholder="t('schedule.selectGroupClass')">
    <el-option v-for="c in list" :key="c.id" :value="c.id" :label="c.name">
      <span>{{ c.name }}</span>
      <span class="muted" style="float: right">{{ c.teacher?.name ?? '' }}</span>
    </el-option>
  </el-select>
</template>
