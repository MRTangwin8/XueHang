<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import StudentSelect from '@/components/StudentSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { fmtDateTime } from '@/utils/time'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { interviewApi, type InterviewRecord } from '../api'
import RecordDialog from '../components/RecordDialog.vue'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const width = useDialogWidth()
const q = reactive<any>({
  studentId: route.query.studentId ? Number(route.query.studentId) : null,
  teacherId: route.query.teacherId ? Number(route.query.teacherId) : null,
  kind: (route.query.kind as string) || '',
  from: (route.query.from as string) || '',
  to: (route.query.to as string) || '',
  page: Number(route.query.page) || 1,
  pageSize: 20
})
const items = ref<InterviewRecord[]>([])
const total = ref(0)
const loading = ref(false)
const target = ref<any>(null)
async function load() {
  loading.value = true
  try {
    const r = await interviewApi.records(q)
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({
    query: {
      ...q,
      studentId: q.studentId || undefined,
      teacherId: q.teacherId || undefined,
      kind: q.kind || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      page: q.page > 1 ? q.page : undefined
    }
  })
  load()
}
function open(r?: InterviewRecord) {
  target.value = {
    record: r || null,
    studentId: q.studentId,
    kind: q.kind || 'CONSULT'
  }
}
async function remove(r: InterviewRecord) {
  await ElMessageBox.confirm(tr('service.text.deleteThisRecord'), tr('service.text.confirmDeletion'), { type: 'warning' })
  await interviewApi.removeRecord(r.id)
  ElMessage.success(tr('common.deleted'))
  load()
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ tr('service.text.consultationInterviewRecords') }}</h2>
      <span class="spacer" />
      <el-button type="primary" @click="open()">{{ tr('service.text.newRecord') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <StudentSelect v-model="q.studentId" />
        <UserSelect v-model="q.teacherId" />
        <DictSelect v-model="q.kind" dict="interviewKinds" />
        <el-date-picker v-model="q.from" type="date" value-format="YYYY-MM-DD" />
        <el-date-picker v-model="q.to" type="date" value-format="YYYY-MM-DD" />
        <el-button type="primary" @click="q.page=1;sync()">{{ tr('service.text.filter') }}</el-button>
      </div>
      <el-table v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.student')">
          <template #default="{ row }: any">{{row.student?.name}}</template>
        </el-table-column>
        <el-table-column :label="tr('service.text.type')">
          <template #default="{ row }: any">
            <DictTag dict="interviewKinds" :value="row.kind" />
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.time')">
          <template #default="{ row }: any">{{fmtDateTime(row.heldAt)}}</template>
        </el-table-column>
        <el-table-column v-if="!mobile" :label="tr('service.text.teacher')">
          <template #default="{ row }: any">{{row.teacher?.name}}</template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')">
          <template #default="{ row }: any">
            <el-button link type="primary" @click="open(row)">{{ tr('common.edit') }}</el-button>
            <el-button link type="danger" @click="remove(row)">{{ tr('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total,prev,pager,next"
          @current-change="sync"
        />
      </div>
    </div>
    <RecordDialog :target="target" @close="target=null" @saved="load" />
  </div>
</template>
