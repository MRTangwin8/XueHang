<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** 校区选择。<CampusSelect v-model="query.campusId" /> */
import { onMounted, ref } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

defineProps<{ placeholder?: string; clearable?: boolean }>()
const model = defineModel<number | null | undefined>()
const list = ref<{ id: number; name: string }[]>([])
onMounted(async () => (list.value = await api.get('/common/campuses')))
</script>

<template>
  <el-select v-model="model" :clearable="clearable !== false" :placeholder="placeholder ?? t('common.allCampuses')">
    <el-option v-for="c in list" :key="c.id" :value="c.id" :label="c.name" />
  </el-select>
</template>
