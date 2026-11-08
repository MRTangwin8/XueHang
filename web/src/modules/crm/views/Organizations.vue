<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 合作机构：列表 + 详情抽屉（基本信息、返点、跟进记录、关联客户 / 学员） */
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useIsMobile } from '@/utils/format'
import { useDict } from '@/stores/dict'
import { fmtDate, fmtDateTime } from '@/utils/time'
import { crmApi, fromPicker, qNum, qStr, type Organization, type OrganizationDetail } from '../api'
import OrgForm from '../components/OrgForm.vue'

const { t } = useI18n()
const dict = useDict()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const blankFilter = () => ({ q: '', status: '' as string | null, type: '' as string | null, ownerId: undefined as number | undefined | null, deleted: false })
const f = reactive(blankFilter())
const page = ref(1)
const pageSize = ref(20)
const items = ref<Organization[]>([])
const total = ref(0)
const loading = ref(false)

const formOpen = ref(false)
const editing = ref<Organization | null>(null)
const drawerOpen = ref(false)
const detail = ref<OrganizationDetail | null>(null)
const detailLoading = ref(false)
const fu = reactive({
  method: '\u5fae\u4fe1', // Persisted dictionary value: WeChat
  content: '',
  followAt: null as string | null,
})
const fuSaving = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await crmApi.organizations({ ...f, deleted: f.deleted ? 1 : undefined, page: page.value, pageSize: pageSize.value })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}

watch(
  () => route.query,
  (q) => {
    if (route.name !== 'crm-organizations') return
    Object.assign(f, blankFilter(), {
      q: qStr(q.q), status: qStr(q.status), type: qStr(q.type), ownerId: qNum(q.ownerId), deleted: q.deleted === '1',
    })
    page.value = qNum(q.page) ?? 1
    pageSize.value = qNum(q.pageSize) ?? 20
    load()
  },
  { immediate: true },
)
function syncQuery() {
  const query: Record<string, string> = {}
  if (f.q.trim()) query.q = f.q.trim()
  if (f.status) query.status = f.status
  if (f.type) query.type = f.type
  if (f.ownerId) query.ownerId = String(f.ownerId)
  if (f.deleted) query.deleted = '1'
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.pageSize = String(pageSize.value)
  const norm = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, qStr(o[k])]))
  if (norm(query) === norm(route.query)) load()
  else router.replace({ query })
}
const search = () => ((page.value = 1), syncQuery())
const reset = () => (Object.assign(f, blankFilter()), search())
const onPage = (p: number) => ((page.value = p), syncQuery())
const onSize = (s: number) => ((pageSize.value = s), (page.value = 1), syncQuery())

function add() {
  editing.value = null
  formOpen.value = true
}
function edit(o: Organization) {
  editing.value = o
  formOpen.value = true
}
function onSaved() {
  load()
  if (drawerOpen.value && detail.value) openDetail(detail.value)
}
async function remove(o: Organization) {
  await ElMessageBox.confirm(t('crm.messages.deleteOrganizationConfirm', { v1: o.name }), t('crm.messages.deleteOrganization'), { type: 'warning' })
  await crmApi.deleteOrganization(o.id)
  ElMessage.success(t('common.deleted'))
  drawerOpen.value = false
  load()
}
async function restore(o: Organization) {
  await crmApi.restoreOrganization(o.id)
  ElMessage.success(t('crm.messages.restored'))
  load()
}

async function openDetail(o: Organization) {
  drawerOpen.value = true
  detailLoading.value = true
  if (detail.value?.id !== o.id) {
    Object.assign(fu, {
      method: '\u5fae\u4fe1', // Persisted dictionary value: WeChat
      content: '',
      followAt: null,
    })
  }
  try {
    detail.value = await crmApi.organization(o.id)
  } finally {
    detailLoading.value = false
  }
}
async function addFollow() {
  if (!detail.value) return
  if (!fu.content.trim()) return ElMessage.warning(t('crm.messages.enterFollowUpDetails'))
  fuSaving.value = true
  try {
    await crmApi.addOrgFollowUp(detail.value.id, { ...fu, followAt: fromPicker(fu.followAt) })
    ElMessage.success(t('crm.messages.followUpRecorded'))
    Object.assign(fu, { content: '', followAt: null })
    detail.value = await crmApi.organization(detail.value.id)
    load()
  } finally {
    fuSaving.value = false
  }
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`)
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input
          v-model="f.q"
          :placeholder="t('crm.messages.organizationContactPhoneCity')"
          clearable
          prefix-icon="Search"
          @keyup.enter="search"
          @clear="search"
        />
        <DictSelect v-model="f.type" dict="organizationTypes" :placeholder="t('crm.messages.type')" @change="search" />
        <DictSelect v-model="f.status" dict="organizationStatuses" :placeholder="t('crm.messages.partnershipStatus')" @change="search" />
        <UserSelect v-model="f.ownerId" :placeholder="t('crm.messages.owner')" @change="search" />
        <el-button @click="reset">{{ t('common.reset') }}</el-button>
        <span class="spacer" />
        <el-switch v-model="f.deleted" :active-text="t('common.recycleBin')" @change="search" />
        <el-button v-if="!f.deleted" type="primary" icon="Plus" @click="add">{{ t('crm.messages.addOrganization') }}</el-button>
      </div>

      <div v-if="isMobile" v-loading="loading" class="cards">
        <el-empty v-if="!items.length && !loading" :description="t('crm.messages.noPartnerOrganizations')" />
        <div v-for="o in items" :key="o.id" class="card" @click="f.deleted ? undefined : openDetail(o)">
          <div class="card-head">
            <b>{{ o.name }}</b>
            <DictTag dict="organizationStatuses" :value="o.status" />
          </div>
          <div class="muted">{{ [dict.label('organizationTypes', o.type), o.province, o.city].filter(Boolean).join(' · ') }}</div>
          <div class="card-line">
            <span>{{ o.contactName || '—' }}</span>
            <a v-if="o.contactPhone" :href="tel(o.contactPhone)" class="tel" @click.stop>{{ o.contactPhone }}</a>
          </div>
          <div class="muted">{{
              t('crm.messages.organizationSummary', { v1: pct(o.rebateRateClass), v2: pct(o.rebateRateVip), v3: o.customerCount, v4: o.studentCount })
          }}</div>
          <div v-if="f.deleted" class="card-line" style="justify-content: flex-end"><el-button size="small" type="primary" @click.stop="restore(o)">{{
              t('common.restore')
          }}</el-button></div>
        </div>
      </div>

      <el-table v-else v-loading="loading" :data="items" row-key="id">
        <el-table-column :label="t('crm.messages.organization')" min-width="200">
          <template #default="{ row }: any">
            <el-button link type="primary" class="name-link" :disabled="f.deleted" @click="openDetail(row)">{{ row.name }}</el-button>
            <div class="muted">{{ [dict.label('organizationTypes', row.type), row.province, row.city].filter(Boolean).join(' · ') }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.contactPerson')" min-width="140">
          <template #default="{ row }: any">
            <div>{{ row.contactName || '—' }}</div>
            <a v-if="row.contactPhone" :href="tel(row.contactPhone)" class="tel">{{ row.contactPhone }}</a>
          </template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.commissionGroupVip')" width="150">
          <template #default="{ row }: any">
            {{ pct(row.rebateRateClass) }} / {{ pct(row.rebateRateVip) }}
            <div v-if="row.rebateRule" class="muted ellipsis" :title="row.rebateRule">{{ row.rebateRule }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90">
          <template #default="{ row }: any"><DictTag dict="organizationStatuses" :value="row.status" /></template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.owner')" width="100">
          <template #default="{ row }: any">{{ row.owner?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.customersStudents')" width="100" align="center">
          <template #default="{ row }: any">{{ row.customerCount }} / {{ row.studentCount }}</template>
        </el-table-column>
        <el-table-column :label="t('crm.messages.lastFollowUp')" width="120">
          <template #default="{ row }: any">
            <span v-if="row.lastFollowAt">{{ fmtDate(row.lastFollowAt) }}</span><span v-else class="muted">{{ t('crm.messages.noFollowUp') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="150" fixed="right">
          <template #default="{ row }: any">
            <el-button v-if="f.deleted" link type="primary" @click="restore(row)">{{ t('common.restore') }}</el-button>
            <template v-else>
              <el-button link type="primary" @click="openDetail(row)">{{ t('common.detail') }}</el-button>
              <el-button link type="primary" @click="edit(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="t('crm.messages.noPartnerOrganizations')" :image-size="80" /></template>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next'"
          background
          @current-change="onPage"
          @size-change="onSize"
        />
      </div>
    </div>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawerOpen" :size="isMobile ? '100%' : '600px'" :title="detail?.name ?? t('crm.messages.organizationDetails')" append-to-body>
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="d-head">
            <DictTag dict="organizationStatuses" :value="detail.status" />
            <el-tag v-if="detail.type" size="small" effect="plain">{{ dict.label('organizationTypes', detail.type) }}</el-tag>
            <span class="muted">{{ t('crm.messages.ownerText', { v1: detail.owner?.name ?? '—' }) }}</span>
            <span class="spacer" />
            <el-button size="small" icon="Edit" @click="edit(detail)">{{ t('common.edit') }}</el-button>
          </div>

          <h3 class="page-title sec">{{ t('crm.messages.basicInformation') }}</h3>
          <el-descriptions :column="isMobile ? 1 : 2" size="small">
            <el-descriptions-item :label="t('crm.messages.region')">{{ [detail.province, detail.city].filter(Boolean).join(' ') || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('common.campus')">{{ detail.campus?.name ?? '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.address')" :span="isMobile ? 1 : 2">{{ detail.address || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.contactPerson')">{{ detail.contactName || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.phone')">
              <a v-if="detail.contactPhone" :href="tel(detail.contactPhone)" class="tel">{{ detail.contactPhone }}</a><span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.wechat')">{{ detail.wechat || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.contractDate')">{{ fmtDate(detail.signedAt) || '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.note" :label="t('common.remark')" :span="isMobile ? 1 : 2">{{ detail.note }}</el-descriptions-item>
          </el-descriptions>

          <h3 class="page-title sec">{{ t('crm.messages.commission') }}</h3>
          <div class="rebate">
            <div class="rb"><span class="muted">{{ t('crm.messages.groupClassCommission') }}</span><b>{{ pct(detail.rebateRateClass) }}</b></div>
            <div class="rb"><span class="muted">{{ t('crm.messages.vipCommission') }}</span><b>{{ pct(detail.rebateRateVip) }}</b></div>
          </div>
          <el-descriptions :column="1" size="small">
            <el-descriptions-item :label="t('crm.messages.commissionTerms')">{{ detail.rebateRule || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('crm.messages.paymentAccount')">
              {{ [detail.bankName, detail.bankHolder, detail.bankAccount].filter(Boolean).join(' / ') || '—' }}
            </el-descriptions-item>
          </el-descriptions>

          <h3 class="page-title sec">{{ t('crm.messages.followUpHistoryTitle', { v1: detail.followUps.length }) }}</h3>
          <div class="fu-form">
            <div class="fu-row">
              <DictSelect v-model="fu.method" dict="followMethods" :clearable="false" style="width: 130px" />
              <el-date-picker
                v-model="fu.followAt"
                type="datetime"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm"
                :placeholder="t('crm.messages.followUpTimeDefaultsToNow')"
                style="flex: 1; min-width: 180px"
              />
            </div>
            <el-input v-model="fu.content" type="textarea" :rows="2" maxlength="2000" :placeholder="t('crm.messages.discussionDetailsPartnershipProgress')" />
            <div style="text-align: right; margin-top: 8px">
              <el-button type="primary" size="small" :loading="fuSaving" @click="addFollow">{{ t('crm.messages.addFollowUp') }}</el-button>
            </div>
          </div>
          <el-empty v-if="!detail.followUps.length" :description="t('crm.messages.noFollowUps')" :image-size="60" />
          <el-timeline v-else>
            <el-timeline-item v-for="x in detail.followUps" :key="x.id" :timestamp="fmtDateTime(x.followAt)" placement="top">
              <div class="fu-item">
                <div><b>{{ x.user.name }}</b> <el-tag size="small" effect="plain">{{ dict.label('followMethods', x.method) }}</el-tag></div>
                <div class="fu-content">{{ x.content }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>

          <h3 class="page-title sec">{{ t('crm.messages.linkedCustomersTitle', { v1: detail.customerCount }) }}</h3>
          <el-empty v-if="!detail.customers.length" :description="t('crm.messages.noneYet')" :image-size="48" />
          <div v-else class="chips">
            <router-link v-for="c in detail.customers" :key="c.id" :to="`/crm/all?id=${c.id}`" class="chip">
              {{ c.name }} <DictTag dict="customerStatuses" :value="c.status" />
            </router-link>
          </div>
          <h3 class="page-title sec">{{ t('crm.messages.linkedStudentsTitle', { v1: detail.studentCount }) }}</h3>
          <el-empty v-if="!detail.students.length" :description="t('crm.messages.noneYet')" :image-size="48" />
          <div v-else class="chips">
            <router-link v-for="s in detail.students" :key="s.id" :to="`/students/${s.id}`" class="chip">
              {{ s.name }} <span class="muted">{{ s.studentNo }}</span>
            </router-link>
          </div>
        </template>
      </div>
    </el-drawer>

    <OrgForm v-model="formOpen" :org="editing" @saved="onSaved" />
  </div>
</template>

<style scoped>
.name-link { font-weight: 600; }
.tel { color: var(--xh-primary); text-decoration: none; }
.ellipsis { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cards { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.card { border: 1px solid var(--xh-border); border-radius: 12px; padding: 12px 14px; box-shadow: var(--xh-shadow); background: #fff; }
.card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.card-line { display: flex; gap: 10px; margin: 4px 0; }
.d-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.d-head .spacer { flex: 1; }
.sec { margin-top: 20px; }
.rebate { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.rb { background: var(--xh-primary-soft); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
.rb b { font-size: 20px; color: var(--xh-primary); }
.fu-form { background: var(--el-fill-color-light); border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px; margin-bottom: 14px; }
.fu-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.fu-item { background: var(--el-fill-color-light); border-radius: 8px; padding: 8px 10px; }
.fu-content { white-space: pre-wrap; margin-top: 4px; line-height: 1.6; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--xh-border); border-radius: 999px;
  color: var(--xh-text); text-decoration: none; font-size: 13px; background: #fff;
}
.chip:hover { border-color: var(--xh-primary); color: var(--xh-primary); }
</style>
