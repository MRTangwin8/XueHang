<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 渠道下拉（仅启用的渠道）。<ChannelSelect v-model="form.channelId" /> */
import { onMounted, ref } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

defineProps<{ placeholder?: string; clearable?: boolean }>()
const model = defineModel<number | null | undefined>()
const list = ref<{ id: number; name: string }[]>([])
onMounted(async () => (list.value = await api.get('/common/channels')))
</script>

<template>
  <el-select v-model="model" filterable :clearable="clearable !== false" :placeholder="placeholder ?? t('crm.messages.selectAChannel')">
    <el-option v-for="c in list" :key="c.id" :value="c.id" :label="c.name" />
  </el-select>
</template>
