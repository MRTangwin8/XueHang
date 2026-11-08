<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 合作机构远程搜索下拉。<OrgSelect v-model="form.organizationId" :initial="customer.organization" /> */
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api/http'

const { t } = useI18n()

interface O { id: number; name: string; type?: string | null }
const props = defineProps<{ initial?: { id: number; name: string } | null; placeholder?: string }>()
const model = defineModel<number | null | undefined>()
const list = ref<O[]>([])
const loading = ref(false)

async function search(q = '') {
  loading.value = true
  try {
    const r = await api.get<O[]>('/common/organizations', { q: q || undefined })
    if (props.initial && !r.some((o) => o.id === props.initial!.id)) r.unshift(props.initial)
    list.value = r
  } finally {
    loading.value = false
  }
}
onMounted(() => search())
watch(() => props.initial?.id, () => search())
</script>

<template>
  <el-select
    v-model="model"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    clearable
    :placeholder="placeholder ?? t('crm.messages.searchOrganizations')"
  >
    <el-option v-for="o in list" :key="o.id" :value="o.id" :label="o.name">
      <span>{{ o.name }}</span><span v-if="o.type" class="muted" style="float: right">{{ o.type }}</span>
    </el-option>
  </el-select>
</template>
