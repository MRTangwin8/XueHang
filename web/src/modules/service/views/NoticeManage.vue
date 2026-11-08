<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教学服务 · 通知公告管理（?create=1 自动打开新建） */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import { fmtDateTime } from '@/utils/time'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { noticeApi, type Notice } from '../api'
import NoticeContent from '../components/NoticeContent.vue'

const { t: tr } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('760px')
const q = reactive({ q: (route.query.q as string) ?? '', audience: (route.query.audience as string) || null, page: Number(
  route.query.page) || 1, pageSize: 20 })
const items = ref<Notice[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await noticeApi.list({ manage: 1, q: q.q || undefined, audience: q.audience || undefined, page: q.page, pageSize: q.pageSize })
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

// ---- 编辑 ----
const show = ref(false)
const preview = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const empty = () => ({ id: 0, title: '', content: '', audience: 'STAFF', pinned: false, campusId: null as number | null })
const form = reactive(empty())
/** 预览用（直接写 form.content 会触发 vue-tsc 3 的类型推断问题） */
const previewText = computed(() => form.content)
const rules = computed(() => ({
  title: [{ required: true, message: tr('service.text.enterATitle') }],
  content: [{ required: true, message: tr('service.text.enterContent') }],
  audience: [{ required: true, message: tr('service.text.selectAnAudience') }],
}))

function openCreate() {
  Object.assign(form, empty())
  preview.value = false
  show.value = true
}
function openEdit(n: Notice) {
  Object.assign(form, { id: n.id, title: n.title, content: n.content, audience: n.audience, pinned: n.pinned, campusId: n.campusId })
  preview.value = false
  show.value = true
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const body = { title: form.title, content: form.content, audience: form.audience, pinned: form.pinned, campusId: form.campusId || null }
    if (form.id) await noticeApi.update(form.id, body)
    else await noticeApi.create(body)
    ElMessage.success(tr('service.text.published'))
    show.value = false
    load()
  } finally {
    saving.value = false
  }
}
async function remove(n: Notice) {
  await ElMessageBox.confirm(tr('service.text.deleteNotice', { v0: n.title }), tr('service.text.confirmDeletion'), { type: 'warning' })
  await noticeApi.remove(n.id)
  ElMessage.success(tr('common.deleted'))
  load()
}
async function togglePin(n: Notice) {
  await noticeApi.update(n.id, { title: n.title, content: n.content, audience: n.audience, pinned: !n.pinned, campusId: n.campusId })
  load()
}

onMounted(() => {
  load()
  if (route.query.create === '1') {
    openCreate()
    router.replace({ query: { ...route.query, create: undefined } })
  }
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.notices') }}</h2>
      <span class="spacer" />
      <el-button type="primary" icon="Plus" @click="openCreate">{{ tr('service.text.publishNotice') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="q.q" :placeholder="tr('service.text.searchTitles')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <DictSelect v-model="q.audience" dict="audiences" :placeholder="tr('service.text.recipients')" @change="search" />
        <el-button type="primary" @click="search">{{ tr('common.search') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.title')" min-width="240">
          <template #default="{ row }">
            <el-tag v-if="row.pinned" type="danger" size="small" effect="plain" style="margin-right: 6px">{{ tr('service.text.pinned') }}</el-tag>
            <span style="font-weight: 600">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.audience')" width="90">
          <template #default="{ row }"><DictTag dict="audiences" :value="row.audience" /></template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('common.campus')" width="110">
          <template #default="{ row }">{{ row.campus?.name ?? tr('common.allCampuses') }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('service.text.publishedBy')" width="110">
          <template #default="{ row }">{{ row.author?.name }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" :label="tr('service.text.publishedAt')" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" :width="isMobile ? 110 : 170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as Notice)">{{ tr('common.edit') }}</el-button>
            <el-button v-if="!isMobile" link @click="togglePin(row as Notice)">
              {{ row.pinned ? tr('service.text.unpin') : tr('service.text.pinned') }}
            </el-button>
            <el-button link type="danger" @click="remove(row as Notice)">{{ tr('common.delete') }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="tr('service.text.noNotices')" /></template>
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
      :title="form.id ? tr('service.text.editNotice') : tr('service.text.publishNotice')"
      :width="dlgWidth"
      :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="tr('service.text.title')" prop="title"><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item :label="tr('service.text.recipients')" prop="audience"><DictSelect v-model="form.audience" dict="audiences" radio /></el-form-item>
        <el-form-item :label="tr('common.campus')"><CampusSelect v-model="form.campusId" :placeholder="tr('common.allCampuses')" /></el-form-item>
        <el-form-item :label="tr('service.text.pinned')"><el-switch v-model="form.pinned" /></el-form-item>
        <el-form-item :label="tr('service.text.content')" prop="content">
          <div style="width: 100%">
            <el-radio-group v-model="preview" size="small" style="margin-bottom: 8px">
              <el-radio-button :value="false">{{ tr('common.edit') }}</el-radio-button>
              <el-radio-button :value="true">{{ tr('service.text.preview') }}</el-radio-button>
            </el-radio-group>
            <el-input
              v-if="!preview"
              v-model="form.content"
              type="textarea"
              :rows="12"
              :placeholder="tr('service.text.enterPlainTextLineBreaksArePreservedUrlsStarting')" />
            <div v-else class="preview-box"><NoticeContent :content="previewText" /></div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show = false">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ tr('service.text.publish') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.preview-box { border: 1px solid var(--xh-border); border-radius: 8px; padding: 12px 16px; min-height: 200px; background: #fafbfe; }
</style>
