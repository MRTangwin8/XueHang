<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * 学员远程搜索选择（按姓名 / 学号 / 电话）。
 * <StudentSelect v-model="form.studentId" status="ENROLLED" />
 * <StudentSelect v-model="ids" multiple />
 */
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

interface S { id: number; name: string; studentNo: string; status: string }
const props = defineProps<{ multiple?: boolean; status?: string; campusId?: number | null; placeholder?: string }>()
const model = defineModel<number | number[] | null | undefined>()
const list = ref<S[]>([])
const loading = ref(false)

async function search(q = '') {
  loading.value = true
  try {
    list.value = await api.get<S[]>('/common/students', { q: q || undefined, status: props.status, campusId: props.campusId || undefined })
  } finally {
    loading.value = false
  }
}
/** 回显：确保已选中的 id 在选项里 */
async function ensureSelected() {
  const ids = (Array.isArray(model.value) ? model.value : model.value ? [model.value] : []).filter((id) => !list.value.some((s) => s.id === id))
  if (!ids.length) return
  const extra = await api.get<S[]>('/common/students', { ids: ids.join(',') })
  list.value = [...list.value, ...extra]
}
onMounted(async () => {
  await search()
  await ensureSelected()
})
watch(model, ensureSelected)
</script>

<template>
  <el-select
    v-model="model"
    :multiple="multiple"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    clearable
    :placeholder="placeholder ?? t('select.student')"
  >
    <el-option v-for="s in list" :key="s.id" :value="s.id" :label="`${s.name}（${s.studentNo}）`" />
  </el-select>
</template>
