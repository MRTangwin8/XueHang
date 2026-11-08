<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDict } from '@/stores/dict'
/**
 * 客户列表：我的客户 / 公海客户 / 全部客户 共用（prop scope）。
 * 筛选条件与分页同步到 URL query；?id=X 自动打开客户详情。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDate, fmtDateTime, tz } from '@/utils/time'
import { crmApi, qNum, qStr, type Customer } from '../api'
import CustomerDrawer from '../components/CustomerDrawer.vue'
import CustomerForm from '../components/CustomerForm.vue'
import ChannelSelect from '../components/ChannelSelect.vue'

const { t } = useI18n()
const dict = useDict()

const props = defineProps<{ scope: 'mine' | 'pool' | 'all' }>()

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const assignWidth = useDialogWidth('420px')

const blankFilter = () => ({
  q: '',
  status: '' as string | null,
  intentLevel: '' as string | null,
  channelId: undefined as number | undefined | null,
  ownerId: undefined as number | undefined | null,
  campusId: undefined as number | undefined | null,
  range: null as [string, string] | null,
  nextFollowDue: false,
  deleted: false,
  sort: 'id',
})
const f = reactive(blankFilter())
const page = ref(1)
const pageSize = ref(20)
const items = ref<Customer[]>([])
const total = ref(0)
const loading = ref(false)
const selected = ref<Customer[]>([])

const drawerOpen = ref(false)
const drawerId = ref<number | null>(null)
const formOpen = ref(false)
const assignOpen = ref(false)
const assignOwner = ref<number | null>(null)
const assignIds = ref<number[]>([])

const isAll = computed(() => props.scope === 'all')
const isPool = computed(() => props.scope === 'pool')
const isMine = computed(() => props.scope === 'mine')
const selectable = computed(() => !f.deleted && (isMine.value || isAll.value))
const canCreate = computed(() => auth.can(['crm.customer.view', 'crm.customer.all']) || (isPool.value && auth.can('crm.pool')))

/** URL query → 筛选条件 */
function readQuery() {
  const q = route.query
  Object.assign(f, blankFilter(), {
    q: qStr(q.q),
    status: qStr(q.status),
    intentLevel: qStr(q.intentLevel),
    channelId: qNum(q.channelId),
    ownerId: qNum(q.ownerId),
    campusId: qNum(q.campusId),
    range: q.from && q.to ? [qStr(q.from), qStr(q.to)] : null,
    nextFollowDue: q.due === '1',
    deleted: q.deleted === '1',
    sort: qStr(q.sort) || 'id',
  })
  page.value = qNum(q.page) ?? 1
  pageSize.value = qNum(q.pageSize) ?? 20
}

function params() {
  return {
    scope: props.scope,
    q: f.q.trim(),
    status: f.status,
    intentLevel: f.intentLevel,
    channelId: f.channelId,
    ownerId: isAll.value ? f.ownerId : undefined,
    campusId: f.campusId,
    from: f.range?.[0],
    to: f.range?.[1],
    nextFollowDue: f.nextFollowDue ? 1 : undefined,
    deleted: isAll.value && f.deleted ? 1 : undefined,
    sort: f.sort !== 'id' ? f.sort : undefined,
    page: page.value,
    pageSize: pageSize.value,
  }
}

/** 筛选条件 → URL query（保留 id 以便详情抽屉） */
function writeQuery() {
  const p = params()
  const query: Record<string, string> = {}
  const put = (k: string, v: unknown) => {
    if (v !== '' && v != null && v !== false) query[k] = String(v)
  }
  put('q', p.q)
  put('status', p.status)
  put('intentLevel', p.intentLevel)
  put('channelId', p.channelId)
  put('ownerId', p.ownerId)
  put('campusId', p.campusId)
  put('from', p.from)
  put('to', p.to)
  put('due', p.nextFollowDue)
  put('deleted', p.deleted)
  put('sort', p.sort)
  if (page.value > 1) put('page', page.value)
  if (pageSize.value !== 20) put('pageSize', pageSize.value)
  if (route.query.id) query.id = qStr(route.query.id)
  const norm = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, qStr(o[k])]))
  const same = norm(query) === norm(route.query)
  if (same) load()
  else router.replace({ query })
}

async function load() {
  loading.value = true
  try {
    const r = await crmApi.customers(params())
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  writeQuery()
}
function reset() {
  Object.assign(f, blankFilter())
  search()
}
function onPage(p: number) {
  page.value = p
  writeQuery()
}
function onSize(s: number) {
  pageSize.value = s
  page.value = 1
  writeQuery()
}

// 路由（含 scope 切换、query 变化）驱动加载
watch(
  () => [route.name, JSON.stringify({ ...route.query, id: undefined })],
  () => {
    if (!['crm-customers', 'crm-pool', 'crm-all'].includes(String(route.name))) return
    readQuery()
    selected.value = []
    load()
  },
  { immediate: true },
)
watch(
  () => route.query.id,
  (id) => {
    const n = qNum(id)
    if (n) {
      drawerId.value = n
      drawerOpen.value = true
    }
  },
  { immediate: true },
)
watch(drawerOpen, (v) => {
  if (!v && route.query.id) {
    const { id: _id, ...rest } = route.query
    router.replace({ query: rest })
  }
})

function open(c: Customer) {
  drawerId.value = c.id
  drawerOpen.value = true
}

async function claim(c: Customer) {
  await crmApi.claim(c.id)
  ElMessage.success(t('crm.messages.claimSuccess', { v1: c.name }))
  load()
}

async function releaseSelected() {
  const ids = selected.value.map((c) => c.id)
  if (!ids.length) return
  await ElMessageBox.confirm(t('crm.messages.releaseSelectedConfirm', { v1: ids.length }), t('crm.messages.moveToPool'), { type: 'warning' })
  const r = await crmApi.release(ids)
  ElMessage.success(t('crm.messages.releaseSelectedSuccess', { v1: r.count }))
  load()
}

function openAssign(ids: number[]) {
  if (!ids.length) return ElMessage.warning(t('crm.messages.selectCustomersFirst'))
  assignIds.value = ids
  assignOwner.value = null
  assignOpen.value = true
}
async function doAssign() {
  if (!assignOwner.value) return ElMessage.warning(t('crm.messages.selectAnOwner'))
  const r = await crmApi.assign(assignIds.value, assignOwner.value)
  ElMessage.success(t('crm.messages.assignSuccess', { v1: r.count }))
  assignOpen.value = false
  load()
}

async function remove(c: Customer) {
  await ElMessageBox.confirm(t('crm.messages.deleteCustomerConfirm', { v1: c.name }), t('crm.messages.deleteCustomer'), { type: 'warning' })
  await crmApi.deleteCustomer(c.id)
  ElMessage.success(t('common.deleted'))
  load()
}
async function restore(c: Customer) {
  await crmApi.restoreCustomer(c.id)
  ElMessage.success(t('crm.messages.restored'))
  load()
}

const isDue = (c: Customer) => !!c.nextFollowAt && ['NEW', 'FOLLOWING'].includes(c.status) && tz(c.nextFollowAt).isBefore(tz().endOf('day'))
const canEditRow = (c: Customer) => c.ownerId === auth.me?.id || auth.can('crm.customer.all')
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
const relTime = (d: string | null) => {
  if (!d) return ''
  const days = tz().startOf('day').diff(tz(d).startOf('day'), 'day')
  return days <= 0 ? t('common.today') : days === 1 ? t('crm.messages.yesterday') : t('crm.messages.daysAgo', { v1: days })
}
const emptyText = computed(() => (f.deleted ? t('crm.messages.theRecycleBinIsEmpty') : isPool.value ? t('crm.messages.noUnassignedCustomers') :
  isMine.value ? t('crm.messages.emptyCustomerList') : t('crm.messages.noMatchingCustomers')))
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="f.q" :placeholder="t('crm.messages.namePhoneWechatQq')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <DictSelect v-model="f.status" dict="customerStatuses" :placeholder="t('crm.messages.customerStatus')" @change="search" />
        <DictSelect v-model="f.intentLevel" dict="intentLevels" :placeholder="t('crm.messages.interestLevel')" @change="search" />
        <ChannelSelect v-model="f.channelId" :placeholder="t('crm.messages.channel')" @change="search" />
        <UserSelect v-if="isAll" v-model="f.ownerId" :placeholder="t('crm.messages.owner')" @change="search" />
        <CampusSelect v-if="isAll || isPool" v-model="f.campusId" @change="search" />
        <el-date-picker
          v-model="f.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          :range-separator="t('common.to')"
          :start-placeholder="t('crm.messages.createdFrom')"
          :end-placeholder="t('crm.messages.createdTo')"
          style="width: 250px"
          @change="search"
        />
        <el-select v-model="f.sort" style="width: 140px" @change="search">
          <el-option value="id" :label="t('crm.messages.byCreationDate')" />
          <el-option value="lastFollowAt" :label="t('crm.messages.byLastFollowUp')" />
          <el-option value="nextFollowAt" :label="t('crm.messages.byNextFollowUp')" />
        </el-select>
        <el-checkbox v-if="!isPool" v-model="f.nextFollowDue" @change="search">{{ t('crm.messages.followUpsDueToday') }}</el-checkbox>
        <el-button @click="reset">{{ t('common.reset') }}</el-button>
        <span class="spacer" />
        <el-switch v-if="isAll" v-model="f.deleted" :active-text="t('common.recycleBin')" @change="search" />
        <el-button v-if="isMine && selected.length" icon="Upload" @click="releaseSelected">{{
            t('crm.messages.releaseSelected', { v1: selected.length })
        }}</el-button>
        <el-button v-if="isAll && !f.deleted" icon="Switch" :disabled="!selected.length" @click="openAssign(selected.map((c) => c.id))"> {{
            t('crm.messages.bulkAssign', { v1: selected.length ? `（${selected.length}）` : '' })
        }}
        </el-button>
        <el-button v-if="canCreate && !f.deleted" type="primary" icon="Plus" @click="formOpen = true">{{ t('crm.messages.newCustomer') }}</el-button>
      </div>

      <!-- 手机：卡片列表 -->
      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!items.length && !loading" :description="emptyText" />
        <div v-for="c in items" :key="c.id" class="card" @click="open(c)">
          <div class="card-top">
            <span class="card-name">{{ c.name }}</span>
            <DictTag dict="intentLevels" :value="c.intentLevel" />
            <DictTag dict="customerStatuses" :value="c.status" />
            <el-tag v-if="c.studentId" size="small" type="success" effect="dark">{{ t('crm.messages.enrolledAsStudent') }}</el-tag>
          </div>
          <div class="card-line">
            <a v-if="c.phone" :href="tel(c.phone)" class="tel" @click.stop><el-icon><Phone /></el-icon>{{ c.phone }}</a>
            <span v-else-if="c.wechat" class="muted">{{ t('crm.messages.wechatText', { v1: c.wechat }) }}</span>
          </div>
          <div class="card-line muted">
            <span>{{ t('crm.messages.lastFollowUpText', { v1: c.lastFollowAt ? relTime(c.lastFollowAt) : t('crm.messages.noFollowUp') }) }}</span>
            <span v-if="c.nextFollowAt" :class="{ 'text-danger': isDue(c) }">{{ t('crm.messages.nextFollowText', { v1: fmtDateTime(c.nextFollowAt) }) }}</span>
          </div>
          <div v-if="!isMine" class="card-line muted">{{ t('crm.messages.ownerText', { v1: c.owner?.name ?? t('crm.messages.unassignedPool') }) }}<span
            v-if="c.channel"
          > · {{
              c.channel.name
          }}</span></div>
          <div v-if="isPool || f.deleted" class="card-actions" @click.stop>
            <el-button v-if="isPool" size="small" type="primary" @click="claim(c)">{{ t('crm.messages.claim') }}</el-button>
            <el-button v-if="f.deleted" size="small" type="primary" @click="restore(c)">{{ t('common.restore') }}</el-button>
          </div>
        </div>
      </div>

      <!-- 桌面：表格 -->
      <el-table v-else v-loading="loading" :data="items" row-key="id" @selection-change="(rows: Customer[]) => (selected = rows)">
        <el-table-column v-if="selectable" type="selection" width="42" />
        <el-table-column :label="t('crm.messages.customer')" min-width="150">
          <template #default="{ row }: any">
            <el-button link type="primary" class="name-link" @click="open(row)">{{ row.name }}</el-button>
            <router-link v-if="row.studentId" :to="`/students/${row.studentId}`" class="stu-link">
              <el-tag size="small" type="success" effect="dark">{{ t('crm.messages.enrolledAsStudent') }}</el-tag>
            </router-link>
            <div class="muted">
              {{ dict.label('educations', row.education) || '' }}
              {{ row.subjectCategory ? ` · ${dict.label('subjectCategories', row.subjectCategory)}` : '' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.contactDetails')" min-width="150">
          <template #default="{ row }: any">
            <div v-if="row.phone"><a :href="tel(row.phone)" class="tel">{{ row.phone }}</a></div>
            <div v-if="row.wechat" class="muted">{{ t('crm.messages.wechatText', { v1: row.wechat }) }}</div>
            <div v-if="!row.phone && !row.wechat && row.qq" class="muted">QQ {{ row.qq }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.interest')" width="86">
          <template #default="{ row }: any"><DictTag dict="intentLevels" :value="row.intentLevel" /></template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="86">
          <template #default="{ row }: any"><DictTag dict="customerStatuses" :value="row.status" /></template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.channelSource')" min-width="130">
          <template #default="{ row }: any">
            <div>{{ row.channel?.name ?? '—' }}</div>
            <div class="muted">{{ [dict.label('customerSources', row.source), row.organization?.name].filter(Boolean).join(' · ') }}</div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMine" :label="t('crm.messages.owner')" width="100">
          <template #default="{ row }: any">{{ row.owner?.name ?? t('crm.messages.unassignedPool') }}</template>
        </el-table-column>
        <el-table-column v-if="isAll" :label="t('common.campus')" width="100">
          <template #default="{ row }: any">{{ row.campus?.name }}</template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.lastFollowUp')" width="140">
          <template #default="{ row }: any">
            <template v-if="row.lastFollowAt">
              <div>{{ relTime(row.lastFollowAt) }}</div>
              <div class="muted">{{ t('crm.messages.followUpTimeAndCount', { v1: fmtDateTime(row.lastFollowAt), v2: row.followCount }) }}</div>
            </template>
            <span v-else class="muted">{{ t('crm.messages.noFollowUp') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.nextFollowUp')" width="140">
          <template #default="{ row }: any">
            <span v-if="row.nextFollowAt" :class="{ 'text-danger': isDue(row) }">{{ fmtDateTime(row.nextFollowAt) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.added')" width="100">
          <template #default="{ row }: any">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" :width="isAll ? 170 : 120" fixed="right">
          <template #default="{ row }: any">
            <template v-if="f.deleted">
              <el-button link type="primary" @click="restore(row)">{{ t('common.restore') }}</el-button>
            </template>
            <template v-else>
              <el-button link type="primary" @click="open(row)">{{ t('common.detail') }}</el-button>
              <el-button v-if="isPool && auth.can('crm.pool')" link type="primary" @click="claim(row)">{{ t('crm.messages.claim') }}</el-button>
              <el-button v-if="isAll" link type="primary" @click="openAssign([row.id])">{{ t('crm.messages.assign') }}</el-button>
              <el-button v-if="!isPool && canEditRow(row) && !row.studentId" link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="emptyText" :image-size="80" /></template>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
          :pager-count="isMobile ? 5 : 7"
          background
          @current-change="onPage"
          @size-change="onSize"
        />
      </div>
    </div>

    <CustomerDrawer v-model="drawerOpen" :customer-id="drawerId" @changed="load" />
    <CustomerForm v-model="formOpen" :scope="scope" @saved="load" />

    <el-dialog v-model="assignOpen" :title="t('crm.messages.assignCustomers')" :width="assignWidth" append-to-body>
      <p class="muted" style="margin-top: 0">{{ t('crm.messages.assignCustomersTo', { v1: assignIds.length }) }}</p>
      <UserSelect v-model="assignOwner" :placeholder="t('crm.messages.chooseAnOwner')" style="width: 100%" />
      <template #footer>
        <el-button @click="assignOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doAssign">{{ t('crm.messages.confirmAssignment') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.name-link { font-weight: 600; font-size: 14px; }
.stu-link { margin-left: 6px; text-decoration: none; }
.tel { color: var(--xh-primary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.cards { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.card { border: 1px solid var(--xh-border); border-radius: 12px; padding: 12px 14px; background: #fff; box-shadow: var(--xh-shadow); }
.card:active { background: var(--xh-primary-soft); }
.card-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.card-name { font-size: 16px; font-weight: 650; margin-right: 2px; }
.card-line { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.card-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
</style>
