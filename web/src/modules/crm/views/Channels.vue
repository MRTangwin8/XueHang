<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 渠道管理：新增 / 编辑 / 停用 / 启用 */
import { computed, reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { crmApi, type Channel } from '../api'

const { t } = useI18n()

const isMobile = useIsMobile()
const width = useDialogWidth('420px')
const list = ref<Channel[]>([])
const loading = ref(false)
const showInactive = ref(false)
const open = ref(false)
const editing = ref<Channel | null>(null)
const form = reactive({ name: '', sort: 50 })
const saving = ref(false)

const rows = computed(() => (showInactive.value ? list.value : list.value.filter((c) => c.active)))

async function load() {
  loading.value = true
  try {
    list.value = await crmApi.channels(true)
  } finally {
    loading.value = false
  }
}
onMounted(load)

function add() {
  editing.value = null
  Object.assign(form, { name: '', sort: (Math.max(0, ...list.value.map((c) => c.sort)) || 0) + 1 })
  open.value = true
}
function edit(c: Channel) {
  editing.value = c
  Object.assign(form, { name: c.name, sort: c.sort })
  open.value = true
}
async function save() {
  if (!form.name.trim()) return ElMessage.warning(t('crm.messages.enterTheChannelName'))
  saving.value = true
  try {
    if (editing.value) await crmApi.updateChannel(editing.value.id, { ...form })
    else await crmApi.createChannel({ ...form })
    ElMessage.success(t('common.saved'))
    open.value = false
    load()
  } finally {
    saving.value = false
  }
}
async function disable(c: Channel) {
  await ElMessageBox.confirm(t('crm.messages.disableChannelConfirm', { v1: c.name }), t('crm.messages.disableChannel'), { type: 'warning' })
  await crmApi.disableChannel(c.id)
  ElMessage.success(t('crm.messages.disabled'))
  load()
}
async function enable(c: Channel) {
  await crmApi.updateChannel(c.id, { active: true })
  ElMessage.success(t('crm.messages.enabled'))
  load()
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-checkbox v-model="showInactive">{{ t('crm.messages.showDisabled') }}</el-checkbox>
        <span class="spacer" />
        <el-button type="primary" icon="Plus" @click="add">{{ t('crm.messages.addChannel') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column :label="t('crm.messages.sortOrder')" prop="sort" width="70" align="center" />
        <el-table-column :label="t('crm.messages.channelName')" min-width="160">
          <template #default="{ row }: any">
            <b>{{ row.name }}</b>
            <el-tag v-if="!row.active" size="small" type="info" style="margin-left: 6px">{{ t('crm.messages.disabled') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.customers')" prop="customerCount" :width="isMobile ? 70 : 100" align="center" />
        <el-table-column :label="t('crm.messages.students')" prop="studentCount" :width="isMobile ? 70 : 100" align="center" />
        <el-table-column :label="t('common.operation')" :width="isMobile ? 100 : 140">
          <template #default="{ row }: any">
            <el-button link type="primary" @click="edit(row)">{{ t('common.edit') }}</el-button>
            <el-button v-if="row.active" link type="danger" @click="disable(row)">{{ t('crm.messages.disable') }}</el-button>
            <el-button v-else link type="success" @click="enable(row)">{{ t('crm.messages.enable') }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('crm.messages.noChannels')" :image-size="72" /></template>
      </el-table>
    </div>

    <el-dialog v-model="open" :title="editing ? t('crm.messages.editChannel') : t('crm.messages.addChannel')" :width="width" append-to-body>
      <el-form label-width="80px" @submit.prevent="save">
        <el-form-item :label="t('crm.messages.channelDisplayName')" required><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item :label="t('crm.messages.sortOrder')"><el-input-number v-model="form.sort" :min="0" :max="9999" /> <span
          class="muted"
          style="margin-left: 8px"
        >{{
            t('crm.messages.lowerValuesAppearFirst')
        }}</span></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
