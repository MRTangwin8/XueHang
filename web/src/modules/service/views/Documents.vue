<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import UserSelect from '@/components/UserSelect.vue'
import DictTag from '@/components/DictTag.vue'
import FileUpload from '@/components/FileUpload.vue'
import { fmtDateTime } from '@/utils/time'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { documentApi, type DocRequest } from '../api'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const width = useDialogWidth()
const tab = ref(route.query.trash === '1' ? 'trash' : route.query.mine === '1' ? 'mine' : 'all')
const q = reactive<any>({ page: Number(route.query.page) || 1, pageSize: 20 })
const items = ref<DocRequest[]>([])
const total = ref(0)
const loading = ref(false)
const assign = ref<DocRequest | null>(null)
const teacher = ref<number | null>(null)
const ret = ref<DocRequest | null>(null)
const returnFile = ref<any>(null)
const returnNote = ref('')
async function load() {
  loading.value = true
  try {
    const r = await documentApi.list({
      page: q.page,
      pageSize: q.pageSize,
      mine: tab.value === 'mine' ? 1 : undefined,
      trash: tab.value === 'trash' ? 1 : undefined
    })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function change() {
  router.replace({
    query: {
      mine: tab.value === 'mine' ? 1 : undefined,
      trash: tab.value === 'trash' ? 1 : undefined,
      page: q.page > 1 ? q.page : undefined
    }
  })
  load()
}
async function doAssign() {
  if (assign.value && teacher.value) {
    await documentApi.assign(assign.value.id, teacher.value)
    ElMessage.success(tr('service.text.assigned'))
    assign.value = null
    load()
  }
}
async function giveBack() {
  if (!ret.value || !returnFile.value)
    return ElMessage.warning(tr('service.text.uploadTheRevisedFile'))
  await documentApi.giveBack(ret.value.id, {
    returnFileUrl: returnFile.value.url,
    returnFileName: returnFile.value.name,
    returnNote: returnNote.value
  })
  ElMessage.success(tr('service.text.returned'))
  ret.value = null
  load()
}
async function remove(d: DocRequest) {
  await ElMessageBox.confirm(tr('service.text.deleteThisDocument'), tr('service.text.confirmDeletion'), { type: 'warning' })
  await documentApi.remove(d.id)
  load()
}
async function restore(d: DocRequest) {
  await documentApi.restore(d.id)
  load()
}
onMounted(load)
function openFile(url: string) {
  window.open(url, '_blank')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.documentRevision') }}</h2>
    </div>
    <div class="page-card">
      <el-tabs v-model="tab" @tab-change="change">
        <el-tab-pane :label="tr('common.all')" name="all" />
        <el-tab-pane :label="tr('service.text.assignedToMe')" name="mine" />
        <el-tab-pane :label="tr('common.recycleBin')" name="trash" />
      </el-tabs>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.student')">
          <template #default="{ row }: any">{{row.student?.name}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.title')" prop="title" min-width="180" />
        <el-table-column v-if="!mobile" :label="tr('service.text.submittedAt2')">
          <template #default="{ row }: any">{{fmtDateTime(row.submittedAt)}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.deadline')">
          <template #default="{ row }: any">
            <span :class="{overdue:row.overdue}">{{fmtDateTime(row.dueAt)}}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('common.status')">
          <template #default="{ row }: any">
            <DictTag dict="docStatuses" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="300">
          <template #default="{ row }: any">
            <el-button link @click="openFile(row.fileUrl)">{{ tr('common.view') }}</el-button>
            <el-button link @click="openFile(row.fileUrl)">{{ tr('common.download') }}</el-button>
            <el-button v-if="tab!=='trash'" link type="primary" @click="assign=row;teacher=row.assignedTeacherId">{{ tr('service.text.assign') }}</el-button>
            <el-button v-if="tab!=='trash'" link type="success" @click="ret=row">{{ tr('service.text.return') }}</el-button>
            <el-button v-if="tab!=='trash'" link type="danger" @click="remove(row)">{{ tr('common.delete') }}</el-button>
            <el-button v-else link type="primary" @click="restore(row)">{{ tr('common.restore') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total,prev,pager,next"
          @current-change="change"
        />
      </div>
    </div>
    <el-dialog :model-value="!!assign" :title="tr('service.text.assignReviewer')" :width="width" @close="assign = null">
      <div class="muted" style="margin-bottom: 8px">{{ assign?.title }}（{{ assign?.student?.name }}）</div>
      <UserSelect v-model="teacher" identity="TEACHER" style="width: 100%" />
      <template #footer>
        <el-button @click="assign=null">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" @click="doAssign">{{ tr('common.confirm') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog :model-value="!!ret" :title="tr('service.text.revisedDocument')" :width="width" @close="ret = null">
      <div class="muted" style="margin-bottom: 8px">{{ ret?.title }}（{{ ret?.student?.name }}）</div>
      <FileUpload kind="file" :tip="tr('service.text.uploadRevisedFile')" @uploaded="returnFile = $event" />
      <el-input v-model="returnNote" type="textarea" :rows="4" :placeholder="tr('service.text.returnNotes2')" style="margin-top: 12px" />
      <template #footer>
        <el-button @click="ret=null">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" @click="giveBack">{{ tr('service.text.return') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.overdue {
  color: #f56c6c;
  font-weight: 600;
}
</style>
