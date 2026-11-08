<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 学员列表（我销售的 / 我担当的 / 全部 共用）。筛选条件与页码同步到 URL query，刷新 / 翻页不丢。
 * <StudentTable scope="teacher" />
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import DictSelect from '@/components/DictSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useEdu } from '@/utils/edu'
import { money, useIsMobile } from '@/utils/format'
import OrderCreateDialog from '@/modules/orders/components/OrderCreateDialog.vue'
import { ordersApi, cleanParams, type Product } from '@/modules/orders/api'
import { studentsApi, type StudentRow } from '../api'

const { t } = useI18n()

const props = defineProps<{ scope: 'sales' | 'teacher' | 'all' }>()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const dict = useDict()
const edu = useEdu()
const isMobile = useIsMobile()

const STR_KEYS = ['q', 'status', 'subjectCategory', 'enrollTerm', 'classMode', 'deleted'] as const
const NUM_KEYS = ['campusId', 'mainTeacherId', 'salesId', 'packageId'] as const
/** 页面自身使用、需在 URL 中保留的其它参数（如 MyStudents 的 tab） */
const KEEP_KEYS = ['tab']

const filters = reactive<Record<string, string | number | undefined>>({})
const page = ref(1)
const pageSize = ref(20)
const rows = ref<StudentRow[]>([])
const total = ref(0)
const loading = ref(false)
const packages = ref<Product[]>([])

const isAll = computed(() => props.scope === 'all')
const isTeacher = computed(() => props.scope === 'teacher')
const canOrder = computed(() => !isTeacher.value && auth.can(['student.enroll', 'order.pay']))
const showMoney = computed(() => rows.value.some((r) => r.latestOrder))
const trash = computed(() => filters.deleted === '1')

function readQuery() {
  const q = route.query
  for (const k of STR_KEYS) filters[k] = typeof q[k] === 'string' && q[k] ? (q[k] as string) : undefined
  for (const k of NUM_KEYS) filters[k] = q[k] ? Number(q[k]) || undefined : undefined
  page.value = Number(q.page) || 1
  pageSize.value = Number(q.pageSize) || 20
}

async function load() {
  loading.value = true
  try {
    const r = await studentsApi.list(cleanParams({ scope: props.scope, ...filters, page: page.value, pageSize: pageSize.value }))
    rows.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}

function pushQuery(extra: { page?: number; pageSize?: number } = {}) {
  const query: LocationQueryRaw = {}
  for (const k of KEEP_KEYS) if (route.query[k]) query[k] = route.query[k]
  Object.assign(query, cleanParams({ ...filters }))
  const p = extra.page ?? 1
  const ps = extra.pageSize ?? pageSize.value
  if (p > 1) query.page = String(p)
  if (ps !== 20) query.pageSize = String(ps)
  const same = JSON.stringify(cleanParams(query as Record<string, unknown>)) === JSON.stringify(cleanParams({ ...route.query }))
  if (same) load()
  else router.replace({ query })
}

const search = () => pushQuery()
function reset() {
  for (const k of [...STR_KEYS, ...NUM_KEYS]) filters[k] = undefined
  pushQuery()
}
function toggleTrash() {
  filters.deleted = trash.value ? undefined : '1'
  pushQuery()
}

const myPath = route.path
watch(
  () => route.query,
  () => {
    if (route.path !== myPath) return // 正在离开本页
    readQuery()
    load()
  },
  { immediate: true },
)
onMounted(async () => {
  packages.value = await ordersApi.products({ type: 'PACKAGE' }).catch(() => [])
})

// ---------- 操作 ----------
/** el-table 插槽 row 类型为 DefaultRow，这里收窄 */
const R = (r: unknown) => r as StudentRow
const orderDlg = ref(false)
const orderStudent = ref<StudentRow | null>(null)
function openOrder(s: StudentRow) {
  orderStudent.value = s
  orderDlg.value = true
}
const detail = (s: StudentRow) => router.push(`/students/${s.id}`)
const interview = (s: StudentRow) => router.push(`/service/interviews?studentId=${s.id}`)
async function restore(s: StudentRow) {
  await ElMessageBox.confirm(t('students.messages.restoreStudent', { p1: s.name }), t('common.restore'), { type: 'info' })
  await studentsApi.restore(s.id)
  ElMessage.success(t('students.messages.restored'))
  load()
}
</script>

<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="filters.q as string"
        :placeholder="t('students.messages.nameStudentIdRomanizedNamePhoneLanguage')"
        clearable
        prefix-icon="Search"
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <DictSelect v-model="filters.status as string" dict="studentStatuses" :placeholder="t('common.status')" />
      <DictSelect v-model="filters.subjectCategory as string" dict="subjectCategories" :placeholder="edu.label('subjectCategory')" />
      <el-select v-model="filters.packageId" clearable filterable :placeholder="t('students.messages.tuitionPackage')">
        <el-option v-for="p in packages" :key="p.id" :value="p.id" :label="p.name" />
      </el-select>
      <DictSelect v-model="filters.classMode as string" dict="classModes" :placeholder="t('students.messages.classAssignment')" />
      <template v-if="isAll">
        <CampusSelect v-model="filters.campusId as number" />
        <UserSelect v-model="filters.mainTeacherId as number" identity="TEACHER" :placeholder="t('students.messages.assignedTeacher')" />
        <UserSelect v-model="filters.salesId as number" :placeholder="t('students.messages.salesAdvisor')" />
      </template>
      <el-input
        v-model="filters.enrollTerm as string"
        :placeholder="t('students.messages.enrollmentTerm')"
        clearable
        style="width: 130px"
        @keyup.enter="search"
      />
      <el-button type="primary" icon="Search" @click="search">{{ t('common.search') }}</el-button>
      <el-button @click="reset">{{ t('common.reset') }}</el-button>
      <span class="spacer" />
      <el-button v-if="isAll && auth.can('student.all')" :type="trash ? 'warning' : 'default'" plain icon="Delete" @click="toggleTrash">
        {{ trash ? t('students.messages.backToList') : t('common.recycleBin') }}
      </el-button>
    </div>
    <el-alert
      v-if="trash"
      type="warning"
      :closable="false"
      show-icon
      :title="t('students.messages.recycleBinDeletedStudentsCanBeRestored')"
      style="margin-bottom: 12px"
    />
    <!-- 手机：卡片列表 -->
    <div v-if="isMobile" v-loading="loading" class="cards">
      <el-empty v-if="!rows.length && !loading" :description="t('students.messages.noStudents')" />
      <div v-for="s in rows" :key="s.id" class="s-card" @click="detail(s)">
        <div class="s-top">
          <span class="s-name">{{ s.name }}</span>
          <span class="muted">{{ s.studentNo }}</span>
          <span class="spacer" />
          <DictTag dict="studentStatuses" :value="s.status" />
        </div>
        <div class="s-line">
          {{ s.languageSchool }}
          ·
          {{ dict.label('subjectCategories', s.subjectCategory) || t('students.messages.uncategorized') }}
          ·
          {{ s.campus?.name }}
        </div>
        <div class="s-line">
          <span v-if="s.packageName">{{ s.packageName }}</span>
          <span v-else class="muted">{{ t('students.messages.noPackageSelected') }}</span>
          <el-tag v-if="s.classMode" size="small" effect="plain" style="margin-left: 6px" disable-transitions>
            {{ dict.label('classModes', s.classMode) }}
          </el-tag>
        </div>
        <div class="s-line muted">
          {{ t('students.messages.assignedContract', { p1: s.mainTeacher?.name ?? '—', p2: s.contractTeacher?.name ?? '—' }) }}
          <template v-if="!isTeacher">
            {{ t('students.messages.sales', { p1: s.sales?.name ?? '—' }) }}
          </template>
        </div>
        <div v-if="s.latestOrder" class="s-line">
          {{
            t('students.messages.paid', { p1: money(s.latestOrder.paidAmount, s.latestOrder.currency),
            p2: money(s.latestOrder.payableAmount, s.latestOrder.currency) })
          }}
          <DictTag dict="orderStatuses" :value="s.latestOrder.status" />
        </div>
        <div class="s-actions" @click.stop>
          <el-button v-if="canOrder && !trash" size="small" type="primary" plain @click="openOrder(s)">
            {{ t('students.messages.courseEnrollmentPayment') }}
          </el-button>
          <el-button v-if="isTeacher" size="small" type="primary" plain icon="ChatDotRound" @click="interview(s)">
            {{ t('students.messages.interview') }}
          </el-button>
          <el-button v-if="trash" size="small" type="warning" plain @click="restore(s)">{{ t('common.restore') }}</el-button>
        </div>
      </div>
    </div>
    <!-- 桌面：表格 -->
    <el-table v-else v-loading="loading" :data="rows" @row-dblclick="(r: unknown) => detail(R(r))">
      <el-table-column :label="t('students.messages.student')" min-width="150" fixed>
        <template #default="{ row }">
          <el-button link type="primary" class="name-btn" @click="detail(R(row))">{{ row.name }}</el-button>
          <div class="muted">{{ row.studentNo }}<template v-if="row.nameAlt"> · {{ row.nameAlt }}</template></div>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.campus')" width="100"><template #default="{ row }">{{ row.campus?.name }}</template></el-table-column>
      <el-table-column v-if="edu.show('subjectCategory')" :label="edu.label('subjectCategory')" width="100">
        <template #default="{ row }">{{ dict.label('subjectCategories', row.subjectCategory) }}</template>
      </el-table-column>
      <el-table-column v-if="edu.show('languageSchool')" prop="languageSchool" :label="edu.label('languageSchool')" min-width="140" show-overflow-tooltip />
      <el-table-column :label="t('students.messages.tuitionPackage')" min-width="170">
        <template #default="{ row }">
          <div v-if="row.packageName">{{ row.packageName }}</div>
          <span v-else class="muted">{{ t('students.messages.noPackageSelected') }}</span>
          <el-tag v-if="row.classMode" size="small" effect="plain" :type="row.classMode === 'CLASS' ? 'primary' : 'warning'" disable-transitions>
            {{ dict.label('classModes', row.classMode) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('students.messages.assignedContract2')" width="130">
        <template #default="{ row }">{{ row.mainTeacher?.name ?? '—' }} / {{ row.contractTeacher?.name ?? '—' }}</template>
      </el-table-column>
      <el-table-column v-if="!isTeacher && scope !== 'sales'" :label="t('students.messages.sales2')" width="100">
        <template #default="{ row }">
          {{ row.sales?.name ?? '—' }}
        </template>
      </el-table-column>
      <el-table-column v-if="showMoney" :label="t('students.messages.orderPaidDue')" min-width="180">
        <template #default="{ row }">
          <template v-if="row.latestOrder">
            <div>{{ money(row.latestOrder.paidAmount, row.latestOrder.currency) }} / {{ money(row.latestOrder.payableAmount, row.latestOrder.currency) }}</div>
            <DictTag dict="orderStatuses" :value="row.latestOrder.status" />
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="enrollTerm" :label="t('students.messages.enrollmentTerm')" width="100" />
      <el-table-column :label="t('common.status')" width="80">
        <template #default="{ row }">
          <DictTag dict="studentStatuses" :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.operation')" :width="isTeacher ? 130 : 160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="detail(R(row))">{{ t('common.detail') }}</el-button>
          <el-button v-if="canOrder && !trash" link type="primary" @click="openOrder(R(row))">{{ t('students.messages.courseEnrollmentPayment') }}</el-button>
          <el-button v-if="isTeacher" link type="primary" icon="ChatDotRound" @click="interview(R(row))">{{ t('students.messages.interview') }}</el-button>
          <el-button v-if="trash" link type="warning" @click="restore(R(row))">{{ t('common.restore') }}</el-button>
        </template>
      </el-table-column>
      <template #empty><el-empty :description="t('students.messages.noStudents')" /></template>
    </el-table>
    <div class="pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
        background
        @current-change="(p: number) => pushQuery({ page: p })"
        @size-change="(s: number) => pushQuery({ pageSize: s })"
      />
    </div>
    <OrderCreateDialog v-model="orderDlg" :student="orderStudent" @created="load" />
  </div>
</template>

<style scoped>
.name-btn { font-weight: 600; font-size: 14px; padding: 0; height: auto; }
.cards { display: grid; gap: 10px; min-height: 120px; }
.s-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; background: #fff; display: grid; gap: 6px; }
.s-top { display: flex; align-items: center; gap: 8px; }
.s-top .spacer { flex: 1; }
.s-name { font-weight: 650; font-size: 15px; }
.s-line { font-size: 13px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.s-actions { display: flex; gap: 8px; justify-content: flex-end; }
.s-actions:empty { display: none; }
</style>
