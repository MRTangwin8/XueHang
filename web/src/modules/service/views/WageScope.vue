<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 薪资审核范围：为每位拥有「薪资审核」权限的员工单独设置可审核的员工范围 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import UserSelect from '@/components/UserSelect.vue'
import { api } from '@/api/http'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { fmtDateTime } from '@/utils/time'
import { wageScopeApi, type Reviewer, type ReviewMode } from '../api'

const { t: tr } = useI18n()

const isMobile = useIsMobile()
const width = useDialogWidth('620px')
const list = ref<Reviewer[]>([])
const loading = ref(false)
const campuses = ref<{ id: number; name: string }[]>([])

const MODE_LABEL = computed<Record<ReviewMode, string>>(() => ({
  ALL: tr('service.text.allStaff'),
  CAMPUS: tr('service.text.staffAtThisCampus'),
  CUSTOM: tr('service.text.custom'),
}))

async function load() {
  loading.value = true
  try {
    list.value = await wageScopeApi.list()
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  campuses.value = await api.get('/common/campuses')
  load()
})

/** 范围说明文字 */
function describe(r: Reviewer): string {
  if (r.isSuper) return tr('service.text.superAdministratorUnrestricted')
  const mode = r.mode ?? r.defaultMode
  if (mode === 'ALL') return tr('service.text.allStaff')
  if (mode === 'CAMPUS') return tr('service.text.staffAt', { v0: r.campus?.name ?? tr('service.text.thisCampus') })
  const parts: string[] = []
  if (r.campuses.length) parts.push(tr('service.text.campuses', { v0: r.campuses.map((c) => c.name).join('、') }))
  if (r.users.length) parts.push(tr('service.text.selectedStaff', { v0: r.users.map((u) => u.name).join('、') }))
  return parts.join('；')
}

// ---------------- 编辑 ----------------
const editing = ref<Reviewer | null>(null)
const form = ref<{ mode: ReviewMode; campusIds: number[]; userIds: number[] }>({ mode: 'CAMPUS', campusIds: [], userIds: [] })
const saving = ref(false)
const open = computed({ get: () => !!editing.value, set: (v) => !v && (editing.value = null) })

function edit(r: Reviewer) {
  editing.value = r
  form.value = { mode: r.mode ?? r.defaultMode, campusIds: r.campuses.map((c) => c.id), userIds: r.users.map((u) => u.id) }
}

async function save() {
  if (!editing.value) return
  if (form.value.mode === 'CUSTOM' && !form.value.campusIds.length && !form.value.userIds.length) {
    return ElMessage.warning(tr('service.text.selectAtLeastOneCampusOrStaffMemberFor'))
  }
  saving.value = true
  try {
    await wageScopeApi.save(editing.value.id, form.value)
    ElMessage.success(tr('service.text.reviewScopeSaved'))
    editing.value = null
    load()
  } finally {
    saving.value = false
  }
}

async function reset(r: Reviewer) {
  await ElMessageBox.confirm(tr('service.text.restoreTheDefaultReviewScopeForRoleBasedScope', { v0: r.name, v1: MODE_LABEL.value[
    r.defaultMode] }), tr('service.text.restoreDefault'), { type: 'warning' })
  await wageScopeApi.reset(r.id)
  ElMessage.success(tr('service.text.defaultRestored'))
  load()
}
</script>

<template>
  <div class="page">
    <el-alert type="info" :closable="false" show-icon class="tip">
      <template #title>{{ tr('service.text.setWhichStaffPayClaimsEachReviewerCanReview') }}</template>
    </el-alert>
    <div v-loading="loading" class="page-card">
      <el-empty v-if="!loading && !list.length" :description="tr('service.text.noStaffHavePayReviewPermissionAssignItUnder')" />
      <el-table v-else-if="!isMobile" :data="list">
        <el-table-column :label="tr('service.text.reviewer')" min-width="140">
          <template #default="{ row }: any">
            <b>{{ row.name }}</b> <span class="muted">{{ row.staffNo }}</span>
            <div class="muted">{{ row.campus?.name }} · {{ row.roleNames.join(' / ') }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.reviewScope')" min-width="260">
          <template #default="{ row }: any">
            <el-tag v-if="row.isSuper" type="danger" size="small">{{ tr('service.text.unrestricted') }}</el-tag>
            <el-tag v-else-if="row.configured" size="small">{{ MODE_LABEL[row.mode as ReviewMode] }}</el-tag>
            <el-tag v-else type="info" size="small">{{ tr('service.text.default2', { mode: MODE_LABEL[row.defaultMode as ReviewMode] }) }}</el-tag>
            <span class="desc">{{ describe(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.updatedAt')" width="150">
          <template #default="{ row }: any">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="150" fixed="right">
          <template #default="{ row }: any">
            <template v-if="!row.isSuper">
              <el-button link type="primary" @click="edit(row)">{{ tr('service.text.configure') }}</el-button>
              <el-button v-if="row.configured" link @click="reset(row)">{{ tr('service.text.restoreDefault') }}</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="cards">
        <div v-for="r in list" :key="r.id" class="card">
          <div><b>{{ r.name }}</b> <span class="muted">{{ r.staffNo }} · {{ r.campus?.name }}</span></div>
          <div class="desc">{{ describe(r) }}</div>
          <div v-if="!r.isSuper" class="ops">
            <el-button size="small" type="primary" plain @click="edit(r)">{{ tr('service.text.configure') }}</el-button>
            <el-button v-if="r.configured" size="small" @click="reset(r)">{{ tr('service.text.restoreDefault') }}</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="open" :title="tr('service.text.configureReviewScope', { v0: editing?.name ?? '' })" :width="width">
      <el-form label-position="top">
        <el-form-item :label="tr('service.text.staffEligibleForReview')">
          <el-radio-group v-model="form.mode">
            <el-radio value="ALL">{{ tr('service.text.allStaff') }}</el-radio>
            <el-radio value="CAMPUS">
              {{ tr('service.text.staffAtThisCampus3', { campus: editing?.campus?.name ?? tr('service.text.noCampusAssigned') }) }}
            </el-radio>
            <el-radio value="CUSTOM">{{ tr('service.text.custom') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.mode === 'CUSTOM'">
          <el-form-item :label="tr('service.text.allStaffAtSelectedCampuses')">
            <el-select v-model="form.campusIds" multiple :placeholder="tr('service.text.selectCampusesMultiple')" style="width: 100%">
              <el-option v-for="c in campuses" :key="c.id" :value="c.id" :label="c.name" />
            </el-select>
          </el-form-item>
          <el-form-item :label="tr('service.text.additionalStaffMembers')">
            <UserSelect v-model="form.userIds" multiple :placeholder="tr('service.text.selectStaffMultiple')" style="width: 100%" />
          </el-form-item>
          <div class="muted">{{ tr('service.text.includesAllStaffAtTheSelectedCampusesPlusIndividually') }}</div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="open = false">{{ tr('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ tr('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tip { margin-bottom: 16px; }
.desc { margin-left: 8px; color: var(--xh-text-2); }
.cards { display: flex; flex-direction: column; gap: 10px; }
.card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.card .desc { margin-left: 0; }
.ops { display: flex; gap: 8px; }
</style>
