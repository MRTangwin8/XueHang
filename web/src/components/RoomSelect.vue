<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** 教室选择，按楼栋分组。<RoomSelect v-model="form.roomId" :campus-id="form.campusId" /> */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

export interface RoomOpt { id: number; name: string; building: string | null; kind: string; campusId: number; capacity: number; allowVip: boolean }
const props = defineProps<{ campusId?: number | null; multiple?: boolean; vipOnly?: boolean; placeholder?: string }>()
const model = defineModel<number | number[] | null | undefined>()
const list = ref<RoomOpt[]>([])

async function load() {
  list.value = await api.get<RoomOpt[]>('/common/rooms', { campusId: props.campusId || undefined })
}
const groups = computed(() => {
  const m = new Map<string, RoomOpt[]>()
  for (const r of list.value) {
    if (props.vipOnly && !r.allowVip) continue
    const k = r.building || t('common.other')
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return [...m.entries()]
})
onMounted(load)
watch(() => props.campusId, load)
</script>

<template>
  <el-select v-model="model" :multiple="multiple" filterable clearable :placeholder="placeholder ?? t('select.room')">
    <el-option-group v-for="[b, rooms] in groups" :key="b" :label="b">
      <el-option v-for="r in rooms" :key="r.id" :value="r.id" :label="r.name" />
    </el-option-group>
  </el-select>
</template>
