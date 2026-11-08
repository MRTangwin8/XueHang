<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教学服务 · 资料管理（上传供教职工 / 学生下载的资料） */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import { fmtDateTime } from '@/utils/time'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import FileUpload, { type UploadedFile } from '@/components/FileUpload.vue'
import { fileApi, fileSize, type SharedFile } from '../api'

const { t: tr } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('600px')
const q = reactive({ q: (route.query.q as string) ?? '', audience: (route.query.audience as string) || null, page: Number(
  route.query.page) || 1, pageSize: 20 })
const items = ref<SharedFile[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await fileApi.list({ manage: 1, q: q.q || undefined, audience: q.audience || undefined, page: q.page, pageSize: q.pageSize })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({ query: { q: q.q || undefined, audience: q.audience || undefined, page: q.page > 1 ? String(q.page) : undefined } })
  load()
}
function search() {
  q.page = 1
  sync()
}

const show = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const empty = () => ({ id: 0, title: '', description: '', fileUrl: '', fileName: '', fileSize: null as number | null,
  audience: 'STAFF', campusId: null as number | null })
const form = reactive(empty())
const rules = computed(() => ({
  title: [{ required: true, message: tr('service.text.enterAResourceName') }],
  fileUrl: [{ required: true, message: tr('service.text.uploadAFile') }],
}))

function openCreate() {
  Object.assign(form, empty())
  show.value = true
}
function openEdit(f: SharedFile) {
  Object.assign(form, { id: f.id, title: f.title, description: f.description ?? '', fileUrl: f.fileUrl, fileName: f.fileName,
    fileSize: f.fileSize, audience: f.audience, campusId: f.campusId })
  show.value = true
}
function onUploaded(f: UploadedFile) {
  form.fileUrl = f.url
  form.fileName = f.name
  form.fileSize = f.size
  if (!form.title) form.title = f.name.replace(/\.[^.]+$/, '')
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const body = { title: form.title, description: form.description || null, fileUrl: form.fileUrl, fileName: form.fileName,
      fileSize: form.fileSize, audience: form.audience, campusId: form.campusId || null }
    if (form.id) await fileApi.update(form.id, body)
    else await fileApi.create(body)
    ElMessage.success(tr('common.saved'))
    show.value = false
    load()
  } finally {
    saving.value = false
  }
}
async function remove(f: SharedFile) {
  await ElMessageBox.confirm(tr('service.text.deleteResource', { v0: f.title }), tr('service.text.confirmDeletion'), { type: 'warning' })
  await fileApi.remove(f.id)
  ElMessage.success(tr('common.deleted'))
  load()
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.resourceManagement') }}</h2>
      <span class="spacer" />
      <el-button type="primary" icon="Upload" @click="openCreate">{{ tr('service.text.uploadResource') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="q.q" :placeholder="tr('service.text.searchResourceNames')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <DictSelect v-model="q.audience" dict="audiences" :placeholder="tr('service.text.visibleTo')" @change="search" />
        <el-button type="primary" @click="search">{{ tr('common.search') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.resourceName')" min-width="200">
          <template #default="{ row }">
            <div style="font-weight: 600">{{ row.title }}</div>
            <div class="muted">{{ row.description }}</div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('service.text.file')" min-width="180">
          <template #default="{ row }">
            <el-link :href="row.fileUrl" target="_blank" type="primary" :underline="false">{{ row.fileName }}</el-link>
            <span class="muted">{{ fileSize(row.fileSize) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.audience')" width="90">
          <template #default="{ row }"><DictTag dict="audiences" :value="row.audience" /></template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('common.campus')" width="110">
          <template #default="{ row }">{{ row.campus?.name ?? tr('common.allCampuses') }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('common.upload')" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}<div class="muted">{{ row.uploadedBy?.name }}</div></template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as SharedFile)">{{ tr('common.edit') }}</el-button>
            <el-button link type="danger" @click="remove(row as SharedFile)">{{ tr('common.delete') }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="tr('service.text.noResources')" /></template>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="sync" />
      </div>
    </div>

    <el-dialog
      v-model="show"
      :title="form.id ? tr('service.text.editResource') : tr('service.text.uploadResource')"
      :width="dlgWidth"
      :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="tr('service.text.file')" prop="fileUrl">
          <div>
            <FileUpload kind="file" :tip="tr('service.text.pdfWordExcelPptImagesZipUpTo20')" @uploaded="onUploaded" />
            <div v-if="form.fileName" class="muted">{{ tr('service.text.currentFile') }}{{ form.fileName }}</div>
          </div>
        </el-form-item>
        <el-form-item :label="tr('service.text.resourceName')" prop="title"><el-input v-model="form.title" maxlength="200" /></el-form-item>
        <el-form-item :label="tr('service.text.description')"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item :label="tr('service.text.visibleTo')"><DictSelect v-model="form.audience" dict="audiences" radio /></el-form-item>
        <el-form-item :label="tr('common.campus')"><CampusSelect v-model="form.campusId" :placeholder="tr('common.allCampuses')" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show = false">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ tr('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
