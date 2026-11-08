<script setup lang="ts">
/** 成绩管理：考试列表（筛选 / 新建 / 发布 / 删除 / 回收站） */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useIsMobile } from '@/utils/format'
import { fmtDate } from '@/utils/time'
import AssessmentDialog from '../components/AssessmentDialog.vue'
import { gradesApi, type AssessmentRow } from '../api'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()
const canManage = computed(() => auth.can('grade.manage'))

const q = route.query
const filters = reactive({
  q: (q.q as string) ?? '',
  kind: (q.kind as string) || null,
  campusId: q.campusId ? Number(q.campusId) : null,
  range: (q.from && q.to ? [q.from, q.to] : null) as string[] | null,
  deleted: q.deleted === '1',
})
const page = ref(Number(q.page) || 1)
const pageSize = ref(20)
const rows = ref<AssessmentRow[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  const params = {
    q: filters.q || undefined,
    kind: filters.kind || undefined,
    campusId: filters.campusId || undefined,
    from: filters.range?.[0] || undefined,
    to: filters.range?.[1] ? `${filters.range[1]}T23:59:59` : undefined,
    deleted: filters.deleted ? 1 : undefined,
    page: page.value,
    pageSize: pageSize.value,
  }
  router.replace({ query: { ...params, pageSize: undefined, to: filters.range?.[1] || undefined, deleted: filters.deleted ? '1' : undefined, page: page.value > 1 ? page.value : undefined } })
  try {
    const r = await gradesApi.list(params)
    rows.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function search() {
  page.value = 1
  load()
}
function reset() {
  Object.assign(filters, { q: '', kind: null, campusId: null, range: null, deleted: false })
  search()
}
onMounted(() => {
  dict.load()
  load()
})

const dlg = ref(false)
const editing = ref<AssessmentRow | null>(null)
function openCreate() {
  editing.value = null
  dlg.value = true
}
function openEdit(r: AssessmentRow) {
  editing.value = r
  dlg.value = true
}
function onSaved(id: number) {
  if (editing.value) load()
  else router.push(`/students/grades/${id}`)
}
async function togglePublish(r: AssessmentRow) {
  await gradesApi.publish(r.id, !r.published)
  ElMessage.success(r.published ? t('grades.list.unpublished') : t('grades.list.publishedMsg'))
  load()
}
async function remove(r: AssessmentRow) {
  await ElMessageBox.confirm(t('common.confirmDelete', { name: r.name }), t('common.confirmTitle'), { type: 'warning' })
  await gradesApi.remove(r.id)
  ElMessage.success(t('common.deleted'))
  load()
}
async function restore(r: AssessmentRow) {
  await gradesApi.restore(r.id)
  ElMessage.success(t('common.operationSuccess'))
  load()
}
const pct = (r: AssessmentRow) => (r.summary.avg != null && r.summary.fullMark ? Math.round((r.summary.avg / r.summary.fullMark) * 100) : null)
const open = (r: AssessmentRow) => !r.deletedAt && router.push(`/students/grades/${r.id}`)
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="filters.q" :placeholder="t('grades.list.searchPh')" clearable style="width: 200px" @keyup.enter="search" />
        <DictSelect v-model="filters.kind" dict="assessmentKinds" :placeholder="t('grades.dialog.kind')" style="width: 140px" />
        <CampusSelect v-model="filters.campusId" :placeholder="t('common.allCampuses')" style="width: 140px" />
        <el-date-picker v-model="filters.range" type="daterange" value-format="YYYY-MM-DD" :start-placeholder="t('common.startDate')"
          :end-placeholder="t('common.endDate')" style="width: 240px" />
        <el-checkbox v-model="filters.deleted" @change="search">{{ t('common.recycleBin') }}</el-checkbox>
        <el-button type="primary" icon="Search" @click="search">{{ t('common.search') }}</el-button>
        <el-button @click="reset">{{ t('common.reset') }}</el-button>
        <span class="spacer" />
        <el-button v-if="canManage" type="primary" icon="Plus" @click="openCreate">{{ t('grades.list.create') }}</el-button>
      </div>

      <!-- 手机：卡片 -->
      <div v-if="isMobile" v-loading="loading" class="cards">
        <div v-for="r in rows" :key="r.id" class="m-card" @click="open(r)">
          <div class="m-top">
            <b>{{ r.name }}</b>
            <el-tag v-if="r.published" size="small" type="success" disable-transitions>{{ t('grades.list.published') }}</el-tag>
          </div>
          <div class="muted">{{ fmtDate(r.examDate) }} · {{ dict.label('assessmentKinds', r.kind) }} · {{ r.classGroup?.name ?? r.campus.name }}</div>
          <div class="m-stat">
            <span>{{ t('grades.list.entered', { p1: r.summary.entered, p2: r.summary.students }) }}</span>
            <span v-if="r.summary.avg != null">{{ t('grades.stats.avg') }} <b>{{ r.summary.avg }}</b> / {{ r.summary.fullMark }}</span>
          </div>
        </div>
        <el-empty v-if="!rows.length && !loading" :description="t('grades.list.empty')" />
      </div>

      <el-table v-else v-loading="loading" :data="rows" class="click-rows" @row-click="open">
        <el-table-column :label="t('grades.dialog.date')" width="110"><template #default="{ row }: any">{{ fmtDate(row.examDate) }}</template></el-table-column>
        <el-table-column :label="t('grades.dialog.name')" min-width="180">
          <template #default="{ row }: any">
            <b>{{ row.name }}</b>
            <el-tag v-if="row.published" size="small" type="success" effect="plain" disable-transitions style="margin-left: 6px">
              {{ t('grades.list.published') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('grades.dialog.kind')" width="100"><template #default="{ row }: any">{{ dict.label('assessmentKinds', row.kind) }}</template></el-table-column>
        <el-table-column :label="t('grades.list.scope')" min-width="140" show-overflow-tooltip>
          <template #default="{ row }: any">{{ row.campus.name }}<span v-if="row.classGroup" class="muted"> · {{ row.classGroup.name }}</span></template>
        </el-table-column>
        <el-table-column :label="t('grades.list.subjects')" min-width="120" show-overflow-tooltip>
          <template #default="{ row }: any">{{ row.conf.subjects.map((s: { name: string }) => s.name).join(' / ') }}</template>
        </el-table-column>
        <el-table-column :label="t('grades.list.progress')" width="90" align="center">
          <template #default="{ row }: any">{{ row.summary.entered }} / {{ row.summary.students }}</template>
        </el-table-column>
        <el-table-column :label="t('grades.stats.avg')" width="130" align="center">
          <template #default="{ row }: any">
            <template v-if="row.summary.avg != null">
              <b>{{ row.summary.avg }}</b> <span class="muted">/ {{ row.summary.fullMark }}</span>
              <el-progress :percentage="pct(row) ?? 0" :show-text="false" :stroke-width="4" />
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('grades.list.creator')" width="90"><template #default="{ row }: any">{{ row.createdBy.name }}</template></el-table-column>
        <el-table-column v-if="canManage" :label="t('common.operation')" width="160" fixed="right">
          <template #default="{ row }: any">
            <template v-if="row.deletedAt">
              <el-button link type="primary" @click.stop="restore(row)">{{ t('common.restore') }}</el-button>
            </template>
            <template v-else>
              <el-button link @click.stop="openEdit(row)">{{ t('common.edit') }}</el-button>
              <el-button link @click.stop="togglePublish(row)">{{ row.published ? t('grades.list.unpublish') : t('grades.list.publish') }}</el-button>
              <el-button link type="danger" @click.stop="remove(row)">{{ t('common.delete') }}</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('grades.list.empty')" /></template>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" background
          :small="isMobile" @current-change="load" />
      </div>
    </div>
    <AssessmentDialog v-model="dlg" :edit="editing" @saved="onSaved" />
  </div>
</template>

<style scoped>
.cards { display: grid; gap: 10px; }
.m-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; }
.m-top { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.m-stat { display: flex; gap: 12px; font-size: 13px; }
.m-stat b { color: var(--xh-primary); }
</style>
