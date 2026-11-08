<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemApi, type Campus, type CampusForm } from '../api'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDateTime } from '@/utils/time'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const dialogWidth = useDialogWidth('520px')

const showDeleted = ref(route.query.deleted === '1')
const list = ref<Campus[]>([])
const loading = ref(false)

const TIMEZONES = ['Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Taipei', 'Asia/Hong_Kong', 'Asia/Singapore']

async function load() {
  loading.value = true
  try {
    list.value = await systemApi.campuses(showDeleted.value)
  } finally {
    loading.value = false
  }
}
watch(showDeleted, (v) => {
  router.replace({ query: v ? { deleted: '1' } : {} })
  load()
})
onMounted(load)

const dlg = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive<CampusForm>({ code: '', name: '', address: '', timezone: 'Asia/Tokyo', sort: 50 })

function openEdit(c?: Campus) {
  editingId.value = c?.id ?? null
  Object.assign(
    form,
    c ? { code: c.code, name: c.name, address: c.address ?? '', timezone: c.timezone, sort: c.sort }
      : { code: '', name: '', address: '', timezone: 'Asia/Tokyo', sort: 50 },
  )
  dlg.value = true
}

async function save() {
  if (!form.code.trim() || !form.name.trim()) return ElMessage.warning(t('system.campus.required'))
  saving.value = true
  try {
    if (editingId.value) await systemApi.updateCampus(editingId.value, form)
    else await systemApi.createCampus(form)
    ElMessage.success(t('common.saved'))
    dlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove(c: Campus) {
  await ElMessageBox.confirm(t('system.campus.deleteConfirm', { name: c.name }), t('system.campus.delete'), { type: 'warning' })
  await systemApi.deleteCampus(c.id)
  ElMessage.success(t('common.deleted'))
  load()
}
async function restore(c: Campus) {
  await systemApi.restoreCampus(c.id)
  ElMessage.success(t('system.shared.restored'))
  load()
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-switch v-model="showDeleted" :active-text="t('common.deleted')" inactive-text="" />
        <span class="spacer" />
        <el-button v-if="!showDeleted" type="primary" icon="Plus" @click="openEdit()">{{ t('system.campus.add') }}</el-button>
      </div>

      <template v-if="isMobile">
        <el-empty v-if="!loading && !list.length" :description="t('system.campus.empty')" />
        <div v-for="c in list" :key="c.id" v-loading="loading" class="m-card">
          <div class="m-head">
            <b>{{ c.name }}</b>
            <el-tag size="small" type="info" disable-transitions>{{ c.code }}</el-tag>
          </div>
          <div class="muted">{{ c.address || t('system.campus.noAddress') }}</div>
          <div class="muted">{{ t('system.campus.summary', { timezone: c.timezone, staff: c.userCount, rooms: c.roomCount, students: c.studentCount }) }}</div>
          <div class="m-actions">
            <template v-if="!showDeleted">
              <el-button link type="primary" @click="openEdit(c)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="remove(c)">{{ t('common.delete') }}</el-button>
            </template>
            <el-button v-else link type="primary" @click="restore(c)">{{ t('common.restore') }}</el-button>
          </div>
        </div>
      </template>

      <el-table v-else v-loading="loading" :data="list">
        <el-table-column prop="code" :label="t('system.fields.code')" width="100" />
        <el-table-column prop="name" :label="t('system.fields.campusName')" min-width="140" />
        <el-table-column prop="address" :label="t('system.fields.address')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="timezone" :label="t('system.fields.timezone')" width="130" />
        <el-table-column :label="t('system.fields.counts')" width="160" align="center">
          <template #default="{ row }">{{ row.userCount }} / {{ row.roomCount }} / {{ row.studentCount }}</template>
        </el-table-column>
        <el-table-column prop="sort" :label="t('system.fields.sort')" width="70" align="center" />
        <el-table-column v-if="showDeleted" :label="t('system.fields.deletedAt')" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.deletedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="130" fixed="right">
          <template #default="{ row }">
            <template v-if="!showDeleted">
              <el-button link type="primary" @click="openEdit(row as Campus)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="remove(row as Campus)">{{ t('common.delete') }}</el-button>
            </template>
            <el-button v-else link type="primary" @click="restore(row as Campus)">{{ t('common.restore') }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('system.campus.empty')" /></template>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="editingId ? t('system.campus.edit') : t('system.campus.add')" :width="dialogWidth">
      <el-form label-width="90px" @submit.prevent="save">
        <el-form-item :label="t('system.fields.campusCode')" required>
        <el-input v-model="form.code" maxlength="20" :placeholder="t('system.campus.codeExample')" />
        </el-form-item>
        <el-form-item :label="t('system.fields.campusName')" required><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item :label="t('system.fields.address')"><el-input v-model="form.address" /></el-form-item>
        <el-form-item :label="t('system.fields.timezone')">
          <el-select v-model="form.timezone" filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="t in TIMEZONES" :key="t" :value="t" :label="t" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('system.fields.sort')"><el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.m-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
.m-head { display: flex; align-items: center; gap: 8px; }
.m-actions { display: flex; justify-content: flex-end; }
</style>
