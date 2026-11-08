<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * 教职工选择。identity="TEACHER" 只列教师（担当老师 / 签约老师 / 任课老师）。
 * <UserSelect v-model="form.mainTeacherId" identity="TEACHER" />
 * <UserSelect v-model="form.teacherIds" multiple identity="TEACHER" />
 */
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

interface U { id: number; name: string; staffNo: string; identity: string; campusId: number | null }
const props = defineProps<{
  identity?: 'TEACHER' | 'STAFF' | 'OTHER'
  campusId?: number | null
  multiple?: boolean
  placeholder?: string
  clearable?: boolean
}>()
const model = defineModel<number | number[] | null | undefined>()
const list = ref<U[]>([])

async function load() {
  list.value = await api.get<U[]>('/common/users', { identity: props.identity, campusId: props.campusId || undefined })
}
onMounted(load)
watch(() => [props.identity, props.campusId], load)
</script>

<template>
  <el-select
    v-model="model"
    :multiple="multiple"
    filterable
    :clearable="clearable !== false"
    :placeholder="placeholder ?? (identity === 'TEACHER' ? t('select.teacher') : t('select.staff'))"
  >
    <el-option v-for="u in list" :key="u.id" :value="u.id" :label="u.name">
      <span>{{ u.name }}</span><span class="muted" style="float: right">{{ u.staffNo }}</span>
    </el-option>
  </el-select>
</template>
