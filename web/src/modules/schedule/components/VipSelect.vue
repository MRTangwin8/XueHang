<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** VIP 课时包远程选择（显示学生与剩余课时）。选中后通过 change 抛出完整对象 */
import { onMounted, ref, watch } from 'vue'
import { scheduleApi, type VipPackage } from '../api'

const { t } = useI18n()

const props = defineProps<{ campusId?: number | null; disabled?: boolean }>()
const model = defineModel<number | null | undefined>()
const emit = defineEmits<{ picked: [pkg: VipPackage | null] }>()
const list = ref<VipPackage[]>([])
const loading = ref(false)

async function search(q = '') {
  loading.value = true
  try {
    list.value = await scheduleApi.vipOptions({ q: q || undefined, campusId: props.campusId })
    await ensureSelected()
  } finally {
    loading.value = false
  }
}
async function ensureSelected() {
  if (model.value && !list.value.some((p) => p.id === model.value)) {
    const extra = await scheduleApi.vipOptions({ ids: String(model.value) })
    list.value = [...extra, ...list.value]
  }
  emit('picked', list.value.find((p) => p.id === model.value) ?? null)
}
/** 外部刷新剩余课时 */
defineExpose({ reload: () => search() })
onMounted(() => search())
watch(model, ensureSelected)
watch(() => props.campusId, () => search())
</script>

<template>
  <el-select
    v-model="model"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    clearable
    :disabled="disabled"
    :placeholder="t('schedule.searchStudentNameLessonPackage')"
  >
    <el-option v-for="p in list" :key="p.id" :value="p.id" :label="`${p.student.name} · ${p.name}`">
      <div class="opt">
        <span>{{ p.student.name }} · {{ p.name }}</span>
        <span class="muted" :class="{ 'text-danger': p.remaining <= 0 }">{{ t('schedule.hLeft', { p0: p.remaining }) }}</span>
      </div>
    </el-option>
  </el-select>
</template>

<style scoped>
.opt { display: flex; justify-content: space-between; gap: 12px; }
</style>
