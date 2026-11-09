<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { checkPassword } from '@/utils/password'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { groupSubjects, systemApi, type Role, type StaffUser, type Subject, type UserForm, type UserQuery } from '../api'
import CampusSelect from '@/components/CampusSelect.vue'
import { api } from '@/api/http'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { money, useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDateTime } from '@/utils/time'

const { t } = useI18n()

function passwordError(value: string) {
  if (!checkPassword(value)) return null
  if (value.length < 8) return t('validation.passwordMin')
  if (value.length > 64) return t('validation.passwordMax')
  return t('validation.passwordLetterDigit')
}

const auth = useAuth()
const dict = useDict()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const dialogWidth = useDialogWidth('760px')

// ---------------- 筛选（同步到 URL） ----------------
const num = (v: unknown) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
const query = reactive({
  identity: str(route.query.identity) ?? '',
  campusId: num(route.query.campusId),
  roleId: num(route.query.roleId),
  subjectId: num(route.query.subjectId),
  status: str(route.query.status),
  q: str(route.query.q) ?? '',
  deleted: route.query.deleted === '1',
  page: num(route.query.page) ?? 1,
  pageSize: num(route.query.pageSize) ?? 20,
})

const identityTabs = computed(() => [{ value: '', label: t('common.all') }, ...dict.options('userIdentities').map((o) => ({ value: o.value, label: o.label }))])

const list = ref<StaffUser[]>([])
const total = ref(0)
const loading = ref(false)

function apiQuery(): UserQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    q: query.q.trim() || undefined,
    identity: query.identity || undefined,
    campusId: query.campusId || undefined,
    roleId: query.roleId || undefined,
    subjectId: query.subjectId || undefined,
    status: query.status || undefined,
    deleted: query.deleted ? '1' : undefined,
  }
}

async function load() {
  const q = apiQuery()
  router.replace({
    query: Object.fromEntries(
      Object.entries(q)
        .filter(([k, v]) => v != null && !(k === 'page' && v === 1) && !(k === 'pageSize' && v === 20))
        .map(([k, v]) => [k, String(v)]),
    ),
  })
  loading.value = true
  try {
    const r = await systemApi.users(q)
    list.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function search() {
  query.page = 1
  load()
}
function reset() {
  Object.assign(query, { identity: '', campusId: undefined, roleId: undefined, subjectId: undefined, status: undefined, q: '', page: 1 })
  load()
}
watch(() => [query.identity, query.campusId, query.roleId, query.subjectId, query.status, query.deleted], search)

// ---------------- 基础数据 ----------------
const roles = ref<Role[]>([])
const subjects = ref<Subject[]>([])
const categories = ref<string[]>([])
async function loadRefs() {
  ;[roles.value, subjects.value, categories.value] = await Promise.all([systemApi.roles(), systemApi.subjects(), systemApi.subjectCategories()])
}
onMounted(() => {
  loadRefs()
  load()
})

// ---------------- 编辑 ----------------
const campuses = ref<{ id: number; name: string }[]>([])
api.get<{ id: number; name: string }[]>('/common/campuses').then((r) => (campuses.value = r)).catch(() => undefined)
const dlg = ref(false)
const editing = ref<StaffUser | null>(null)
const saving = ref(false)
const emptyForm = (): UserForm => ({
  staffNo: '', name: '', phone: '', email: '', password: '', identity: 'TEACHER', campusId: auth.me?.campusId ?? null,
  manageCampusIds: [], roleIds: [], subjectIds: [], hourlyWage: null, transportFee: null,
  bankName: '', bankBranch: '', bankAccount: '', bankHolder: '', note: '', sort: 50,
})
const form = reactive<UserForm>(emptyForm())

/** 可选课程：启用中的 + 当前账号已关联（即使已停用） */
const subjectGroups = computed(() => {
  const linked = new Set(form.subjectIds)
  return groupSubjects(subjects.value.filter((s) => s.active || linked.has(s.id)), categories.value)
})
function toggleSubject(id: number) {
  const i = form.subjectIds.indexOf(id)
  if (i >= 0) form.subjectIds.splice(i, 1)
  else form.subjectIds.push(id)
}

function openEdit(u?: StaffUser) {
  editing.value = u ?? null
  if (u) {
    Object.assign(form, {
      staffNo: u.staffNo, name: u.name, phone: u.phone ?? '', email: u.email ?? '', password: undefined, identity: u.identity, campusId: u.campusId,
      manageCampusIds: [...(u.manageCampusIds ?? [])], roleIds: [...u.roleIds], subjectIds: [...u.subjectIds], hourlyWage: u.hourlyWage, transportFee: u.transportFee,
      bankName: u.bankName ?? '', bankBranch: u.bankBranch ?? '', bankAccount: u.bankAccount ?? '',
      bankHolder: u.bankHolder ?? '', note: u.note ?? '', sort: u.sort,
    })
  } else {
    Object.assign(form, emptyForm())
  }
  dlg.value = true
}

async function save() {
  if (!form.staffNo.trim() || !form.name.trim()) return ElMessage.warning(t('system.user.required'))
  if (!editing.value) {
    const err = passwordError(form.password ?? '')
    if (err) return ElMessage.warning(err)
  }
  saving.value = true
  try {
    if (editing.value) {
      const { password: _pw, ...body } = form
      await systemApi.updateUser(editing.value.id, body)
    } else {
      await systemApi.createUser({ ...form })
    }
    ElMessage.success(t('common.saved'))
    dlg.value = false
    load()
    loadRefs()
  } finally {
    saving.value = false
  }
}

// ---------------- 行操作 ----------------
async function resetPassword(u: StaffUser) {
  const { value } = await ElMessageBox.prompt(t('system.user.passwordPrompt', { name: u.name, staffNo: u.staffNo }), t('system.user.resetPassword'), {
    inputType: 'password',
    inputPlaceholder: t('profile.passwordRule'),
    inputValidator: (v) => passwordError(v ?? '') ?? true,
  })
  await systemApi.resetPassword(u.id, value)
  ElMessage.success(t('system.user.passwordReset'))
}
async function toggleLock(u: StaffUser) {
  if (u.status === 'LOCKED') {
    await systemApi.unlockUser(u.id)
    ElMessage.success(t('system.user.unlocked'))
  } else {
    await ElMessageBox.confirm(t('system.user.lockConfirm', { name: u.name }), t('system.user.lockAccount'), { type: 'warning' })
    await systemApi.lockUser(u.id)
    ElMessage.success(t('system.user.locked'))
  }
  load()
}
async function remove(u: StaffUser) {
  await ElMessageBox.confirm(t('system.user.deleteConfirm', { name: u.name, staffNo: u.staffNo }), t('system.user.delete'), { type: 'warning' })
  await systemApi.deleteUser(u.id)
  ElMessage.success(t('system.user.deleted'))
  load()
}
async function restore(u: StaffUser) {
  await systemApi.restoreUser(u.id)
  ElMessage.success(t('system.user.restored', { name: u.name }))
  load()
}
function onCommand(cmd: string, u: StaffUser) {
  if (cmd === 'reset') resetPassword(u)
  else if (cmd === 'lock') toggleLock(u)
  else if (cmd === 'delete') remove(u)
}
const isSelf = (u: StaffUser) => u.id === auth.me?.id
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-segmented v-model="query.identity" :options="identityTabs" :disabled="loading" />
        <span class="spacer" />
        <el-switch v-model="query.deleted" :active-text="t('common.recycleBin')" />
        <el-button v-if="!query.deleted" type="primary" icon="Plus" @click="openEdit()">{{ t('system.user.add') }}</el-button>
      </div>
      <div class="toolbar">
        <el-input v-model="query.q" :placeholder="t('system.user.search')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <CampusSelect v-model="query.campusId" />
        <el-select v-model="query.roleId" clearable :placeholder="t('system.user.allRoles')">
          <el-option v-for="r in roles" :key="r.id" :value="r.id" :label="r.name" />
        </el-select>
        <el-select v-model="query.subjectId" clearable filterable :placeholder="t('system.menu.subjects')">
          <el-option-group v-for="g in groupSubjects(subjects, categories)" :key="g.category" :label="g.category">
            <el-option v-for="s in g.items" :key="s.id" :value="s.id" :label="s.name" />
          </el-option-group>
        </el-select>
        <el-select v-model="query.status" clearable :placeholder="t('system.user.allStatuses')">
          <el-option v-for="o in dict.options('userStatuses')" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button type="primary" @click="search">{{ t('system.shared.query') }}</el-button>
        <el-button @click="reset">{{ t('common.reset') }}</el-button>
      </div>

      <el-alert v-if="query.deleted" type="info" :closable="false" show-icon style="margin-bottom: 12px" :title="t('system.user.recycleHint')" />

      <!-- 手机：卡片 -->
      <div v-if="isMobile" v-loading="loading">
        <el-empty v-if="!loading && !list.length" :description="t('system.user.empty')" />
        <div v-for="u in list" :key="u.id" class="m-card">
          <div class="m-head">
            <b>{{ u.name }}</b>
            <span class="muted">{{ u.staffNo }}</span>
            <DictTag dict="userIdentities" :value="u.identity" />
            <span class="spacer" />
            <DictTag v-if="!query.deleted" dict="userStatuses" :value="u.status" />
          </div>
          <div class="muted">{{ u.campus?.name ?? t('system.user.noCampus') }} · {{ u.roles.map((r) => r.name).join('、') || t('system.user.noRole') }}</div>
          <div v-if="u.subjects.length" class="tags">
            <el-tag v-for="s in u.subjects" :key="s.id" size="small" effect="plain" disable-transitions>{{ s.name }}</el-tag>
          </div>
          <div class="muted">{{
            query.deleted
              ? t('system.user.deletedAt', { date: fmtDateTime(u.deletedAt) })
              : t('system.user.lastLogin', { date: fmtDateTime(u.lastLoginAt) || '—' })
          }}</div>
          <div class="m-actions">
            <el-button v-if="query.deleted" type="primary" size="small" @click="restore(u)">{{ t('common.restore') }}</el-button>
            <template v-else>
              <el-button link type="primary" @click="openEdit(u)">{{ t('common.edit') }}</el-button>
              <el-button link type="primary" @click="resetPassword(u)">{{ t('system.user.resetPassword') }}</el-button>
              <el-button v-if="!isSelf(u)" link :type="u.status === 'LOCKED' ? 'success' : 'warning'" @click="toggleLock(u)">{{
                u.status === 'LOCKED' ? t('system.user.unlock') : t('system.user.lock')
              }}</el-button>
              <el-button v-if="!isSelf(u)" link type="danger" @click="remove(u)">{{ t('common.delete') }}</el-button>
            </template>
          </div>
        </div>
      </div>

      <!-- 桌面：表格 -->
      <el-table v-else v-loading="loading" :data="list">
        <el-table-column prop="staffNo" :label="t('auth.staffNo')" width="110" />
        <el-table-column :label="t('profile.name')" min-width="110">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="isSelf(row as StaffUser)" size="small" type="info" style="margin-left: 4px" disable-transitions>{{ t('system.user.self') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('system.fields.identity')" width="80">
          <template #default="{ row }"><DictTag dict="userIdentities" :value="row.identity" /></template>
        </el-table-column>
        <el-table-column :label="t('common.campus')" width="110">
          <template #default="{ row }: any">
            {{ row.campus?.name ?? '—' }}
            <el-tooltip v-if="row.manageCampuses?.length" :content="row.manageCampuses.map((c: { name: string }) => c.name).join(' / ')" placement="top">
              <el-tag size="small" type="info" effect="plain" disable-transitions>+{{ row.manageCampuses.length }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column :label="t('system.fields.roles')" min-width="130">
          <template #default="{ row }">
            <div class="tags">
              <el-tag v-for="r in row.roles" :key="r.id" size="small" :type="r.isSystem ? 'warning' : 'primary'" disable-transitions>{{ r.name }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('system.menu.subjects')" min-width="200">
          <template #default="{ row }">
            <div class="tags">
              <el-tag v-for="s in row.subjects" :key="s.id" size="small" effect="plain" :type="s.active ? 'success' : 'info'" disable-transitions>{{
                s.name
              }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" :label="t('system.fields.phone')" width="120" />
        <el-table-column v-if="!query.deleted" :label="t('common.status')" width="70">
          <template #default="{ row }"><DictTag dict="userStatuses" :value="row.status" /></template>
        </el-table-column>
        <el-table-column v-if="!query.deleted" :label="t('system.fields.lastLogin')" width="140">
          <template #default="{ row }"><span class="muted">{{ fmtDateTime(row.lastLoginAt) || '—' }}</span></template>
        </el-table-column>
        <el-table-column v-else :label="t('system.fields.deletedAt')" width="140">
          <template #default="{ row }">{{ fmtDateTime(row.deletedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="130" fixed="right">
          <template #default="{ row }">
            <el-button v-if="query.deleted" link type="primary" @click="restore(row as StaffUser)">{{ t('common.restore') }}</el-button>
            <template v-else>
              <el-button link type="primary" @click="openEdit(row as StaffUser)">{{ t('common.edit') }}</el-button>
              <el-dropdown trigger="click" @command="(c: string) => onCommand(c, row as StaffUser)">
                <el-button link type="primary" style="margin-left: 8px">{{ t('common.more') }}<el-icon class="el-icon--right">
                <ArrowDown />
                </el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="reset" icon="Key">{{ t('system.user.resetPassword') }}</el-dropdown-item>
                    <el-dropdown-item v-if="!isSelf(row as StaffUser)" command="lock" :icon="row.status === 'LOCKED' ? 'Unlock' : 'Lock'">{{
                      row.status === 'LOCKED' ? t('system.user.unlock') : t('system.user.lock')
                    }}</el-dropdown-item>
                    <el-dropdown-item v-if="!isSelf(row as StaffUser)" command="delete" icon="Delete" divided style="color: var(--el-color-danger)">{{
                      t('common.delete')
                    }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="query.deleted ? t('system.user.recycleEmpty') : t('system.user.empty')" /></template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
          :pager-count="isMobile ? 5 : 7"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </div>

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="dlg"
      :title="editing ? t('system.user.edit', { name: editing.name }) : t('system.user.add')"
      :width="dialogWidth"
      top="5vh"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px" class="user-form" @submit.prevent="save">
        <div class="sec-title">{{ t('system.fields.accountSection') }}</div>
        <el-row :gutter="12">
          <el-col :xs="24" :sm="12">
          <el-form-item :label="t('auth.staffNo')" required>
          <el-input v-model="form.staffNo" maxlength="30" :placeholder="t('system.user.loginName')" />
          </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('profile.name')" required><el-input v-model="form.name" maxlength="50" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12">
          <el-form-item :label="t('system.fields.identity')" required>
          <DictSelect v-model="form.identity" dict="userIdentities" radio />
          </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
          <el-form-item :label="t('common.campus')">
          <CampusSelect v-model="form.campusId" :placeholder="t('system.user.selectCampus')" style="width: 100%" />
          </el-form-item>
          </el-col>
          <el-col :span="24">
          <el-form-item :label="t('system.user.manageCampuses')">
          <el-select v-model="form.manageCampusIds" multiple clearable :placeholder="t('system.user.manageCampusesPh')" style="width: 100%">
            <el-option v-for="c in campuses.filter((x) => x.id !== form.campusId)" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
          <div class="muted" style="width: 100%; line-height: 1.5">{{ t('system.user.manageCampusesHint') }}</div>
          </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('system.fields.roles')">
              <el-select v-model="form.roleIds" multiple :placeholder="t('system.user.multiple')" style="width: 100%">
                <el-option v-for="r in roles" :key="r.id" :value="r.id" :label="r.name">
                  <span>{{ r.name }}</span><span class="muted" style="float: right">{{ dict.label('dataScopes', r.dataScope) }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="!editing" :xs="24" :sm="12">
            <el-form-item :label="t('system.fields.initialPassword')" required>
            <el-input v-model="form.password" type="password" show-password :placeholder="t('profile.passwordRule')" autocomplete="new-password" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.phone')"><el-input v-model="form.phone" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.email')"><el-input v-model="form.email" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12">
          <el-form-item :label="t('system.fields.sort')">
          <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
          </el-form-item>
          </el-col>
        </el-row>

        <div class="sec-title">{{ t('system.menu.subjects') }} <span class="muted">{{ t('system.user.selectedSubjects', { n: form.subjectIds.length }) }}</span>
        </div>
        <div class="subject-groups">
          <div v-for="g in subjectGroups" :key="g.category" class="sg">
            <div class="sg-label">{{ g.category }}</div>
            <div class="sg-tags">
              <el-check-tag
                v-for="s in g.items"
                :key="s.id"
                :checked="form.subjectIds.includes(s.id)"
                :type="s.active ? 'primary' : 'info'"
                @change="toggleSubject(s.id)"
              >
                {{ s.name }}<span v-if="!s.active">{{ t('system.user.disabledSuffix') }}</span>
              </el-check-tag>
            </div>
          </div>
          <el-empty v-if="!subjectGroups.length" :image-size="60" :description="t('system.user.noSubjects')" />
        </div>

        <div class="sec-title">{{ t('system.fields.salary') }}</div>
        <el-row :gutter="12">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('system.fields.hourlyWage')">
              <el-input-number v-model="form.hourlyWage" :min="0" :step="100" :controls="false" :placeholder="t('system.fields.yen')" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('system.fields.transport')">
              <el-input-number
                v-model="form.transportFee"
                :min="0"
                :step="10"
                :controls="false"
                :placeholder="t('system.fields.oneWayYen')"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="sec-title">{{ t('system.fields.bankInfo') }}</div>
        <el-row :gutter="12">
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.bank')"><el-input v-model="form.bankName" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.branch')"><el-input v-model="form.bankBranch" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.account')"><el-input v-model="form.bankAccount" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item :label="t('system.fields.holder')"><el-input v-model="form.bankHolder" /></el-form-item></el-col>
        </el-row>

        <div class="sec-title">{{ t('common.remark') }}</div>
        <el-form-item label-width="0"><el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" show-word-limit /></el-form-item>

        <div v-if="editing" class="muted meta">
          {{
            t('system.user.createdAt', { date: fmtDateTime(editing.createdAt) })
          }} · {{
            t('system.user.lastLogin', { date: fmtDateTime(editing.lastLoginAt) || '—' })
          }}{{
            editing.lastLoginIp ? `（${editing.lastLoginIp}）` : ''
          }}
          <template v-if="editing.hourlyWage != null">{{ t('system.user.currentWage', { amount: money(editing.hourlyWage) }) }}</template>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.m-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
.m-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.m-head .spacer { flex: 1; }
.m-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 4px; }
.sec-title {
  font-weight: 650; font-size: 14px; margin: 6px 0 12px; padding-left: 10px;
  border-left: 3px solid var(--xh-primary); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.sec-title .muted { font-weight: 400; }
.subject-groups { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.sg { display: flex; gap: 12px; align-items: flex-start; }
.sg-label { width: 78px; flex-shrink: 0; text-align: right; color: var(--xh-text-2); font-size: 13px; padding-top: 4px; }
.sg-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.sg-tags .el-check-tag { font-weight: 500; padding: 5px 12px; }
.meta { border-top: 1px dashed var(--xh-border); padding-top: 10px; }
@media (max-width: 767px) {
  .sg { flex-direction: column; gap: 4px; }
  .sg-label { width: auto; text-align: left; padding-top: 0; }
}
</style>
