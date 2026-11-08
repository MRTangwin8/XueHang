<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 客户详情抽屉：关键信息 + 跟进时间线 + 快速跟进 + 编辑 / 公海 / 转学员 */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useIsMobile } from '@/utils/format'
import { fmtDateTime, tz } from '@/utils/time'
import { crmApi, fromPicker, type CustomerDetail, type FollowUp } from '../api'
import CustomerForm from './CustomerForm.vue'

const { t } = useI18n()

const props = defineProps<{ customerId: number | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ changed: [] }>()

const auth = useAuth()
const dict = useDict()
const router = useRouter()
const isMobile = useIsMobile()
const loading = ref(false)
const c = ref<CustomerDetail | null>(null)
const editOpen = ref(false)
const saving = ref(false)

const fu = reactive({
  method: '\u7535\u8bdd', // Persisted dictionary value: phone
  content: '',
  intentLevel: null as string | null,
  isVisit: false,
  nextFollowAt: null as string | null,
})

async function load() {
  if (!props.customerId) return
  loading.value = true
  try {
    c.value = await crmApi.customer(props.customerId)
    fu.intentLevel = c.value.intentLevel
  } finally {
    loading.value = false
  }
}
watch(
  () => [visible.value, props.customerId],
  () => {
    if (visible.value && props.customerId) {
      c.value = null
      Object.assign(fu, {
        method: '\u7535\u8bdd', // Persisted dictionary value: phone
        content: '',
        isVisit: false,
        nextFollowAt: null,
      })
      load()
    }
  },
  { immediate: true },
)

const isMine = computed(() => !!c.value && c.value.ownerId === auth.me?.id)
const inPool = computed(() => !!c.value && c.value.ownerId == null)
const deleted = computed(() => !!c.value?.deletedAt)
const canFollow = computed(() => !!c.value && c.value.canEdit && !deleted.value)
const isDue = computed(() => !!c.value?.nextFollowAt && tz(c.value.nextFollowAt).isBefore(tz().endOf('day')))

const canDeleteFollow = (f: FollowUp) => f.userId === auth.me?.id && Date.now() - new Date(f.createdAt).getTime() < 24 * 3600 * 1000

async function submitFollow() {
  if (!c.value) return
  if (!fu.content.trim()) return ElMessage.warning(t('crm.messages.enterFollowUpDetails'))
  saving.value = true
  try {
    await crmApi.addFollowUp(c.value.id, { ...fu, nextFollowAt: fromPicker(fu.nextFollowAt) })
    ElMessage.success(t('crm.messages.followUpRecorded'))
    Object.assign(fu, { content: '', isVisit: false, nextFollowAt: null })
    await load()
    emit('changed')
  } finally {
    saving.value = false
  }
}

async function removeFollow(f: FollowUp) {
  await ElMessageBox.confirm(t('crm.messages.deleteThisFollowUpRecord'), t('crm.messages.deleteFollowUp'), { type: 'warning' })
  await crmApi.deleteFollowUp(f.id)
  ElMessage.success(t('common.deleted'))
  await load()
  emit('changed')
}

async function claim() {
  if (!c.value) return
  await crmApi.claim(c.value.id)
  ElMessage.success(t('crm.messages.addedToMyCustomers'))
  await load()
  emit('changed')
}

async function release() {
  if (!c.value) return
  await ElMessageBox.confirm(t('crm.messages.releaseConfirm', { v1: c.value.name }), t('crm.messages.moveToPool'), { type: 'warning' })
  await crmApi.release([c.value.id])
  ElMessage.success(t('crm.messages.movedToPool'))
  emit('changed')
  visible.value = false
}

function toStudent() {
  if (!c.value) return
  if (c.value.studentId) router.push(`/students/${c.value.studentId}`)
  else router.push({ path: '/students/enroll', query: { customerId: String(c.value.id) } })
}

function onSaved() {
  load()
  emit('changed')
}

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
</script>

<template>
  <el-drawer v-model="visible" :size="isMobile ? '100%' : '600px'" :with-header="false" append-to-body class="cust-drawer">
    <div v-loading="loading" class="wrap">
      <template v-if="c">
        <!-- 头部 -->
        <div class="head">
          <div class="avatar">{{ c.name.slice(0, 1) }}</div>
          <div class="head-main">
            <div class="name-row">
              <span class="name">{{ c.name }}</span>
              <span v-if="c.gender" class="muted">{{ dict.label('genders', c.gender) }}</span>
              <DictTag dict="intentLevels" :value="c.intentLevel" />
              <DictTag dict="customerStatuses" :value="c.status" />
              <el-tag v-if="c.studentId" type="success" size="small" effect="dark">{{ t('crm.messages.enrolledAsStudent') }}</el-tag>
              <el-tag v-if="deleted" type="danger" size="small">{{ t('common.deleted') }}</el-tag>
            </div>
            <div class="muted"> {{
                t('crm.messages.customerSummary', { v1: c.owner?.name ?? t('crm.messages.unassignedPool'), v2: c.campus?.name, v3: c.followCount })
            }} </div>
          </div>
          <el-button class="close" icon="Close" circle text @click="visible = false" />
        </div>

        <div class="actions">
          <el-button v-if="c.canEdit && !deleted" icon="Edit" @click="editOpen = true">{{ t('common.edit') }}</el-button>
          <el-button v-if="isMine && !deleted && !c.studentId" icon="Upload" @click="release">{{ t('crm.messages.moveToPool') }}</el-button>
          <el-button v-if="inPool && !deleted && auth.can('crm.pool')" type="primary" icon="Pointer" @click="claim">{{ t('crm.messages.claim') }}</el-button>
          <el-button v-if="c.studentId" type="success" plain icon="User" @click="toStudent">{{ t('crm.messages.viewStudent') }}</el-button>
          <el-button v-else-if="auth.can('student.enroll') && !deleted && !inPool" type="success" icon="Promotion" @click="toStudent">{{
              t('crm.messages.enrollAsStudent')
          }}</el-button>
        </div>

        <!-- 关键信息 -->
        <el-descriptions :column="isMobile ? 1 : 2" size="small" class="info">
          <el-descriptions-item :label="t('crm.messages.phone')">
            <a v-if="c.phone" :href="tel(c.phone)" class="link">{{ c.phone }}</a><span v-else class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.wechat')">{{ c.wechat || '—' }}</el-descriptions-item>
          <el-descriptions-item label="QQ">{{ c.qq || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.email')">{{ c.email || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.region')">{{ [c.province, c.city].filter(Boolean).join(' ') || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.highestEducation')">
            {{ dict.label('educations', c.education) || '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.currentOrFormerSchool')">{{ c.currentSchool || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.subjectArea')">
            {{ dict.label('subjectCategories', c.subjectCategory) || '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.targetInstitution')">{{ c.targetSchool || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.inquiryMethod')">
            {{ dict.label('customerSources', c.source) || '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.channel')">{{ c.channel?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.menu.partnerOrganizations')">{{ c.organization?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.lastFollowUp')">{{ fmtDateTime(c.lastFollowAt) || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.nextFollowUp')">
            <span :class="{ 'text-danger': isDue }">{{ fmtDateTime(c.nextFollowAt) || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('crm.messages.createdAt')">{{ fmtDateTime(c.createdAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="c.student" :label="t('crm.messages.student')">
            <router-link :to="`/students/${c.student.id}`" class="link">{{ c.student.name }}（{{ c.student.studentNo }}）</router-link>
          </el-descriptions-item>
          <el-descriptions-item v-if="c.note" :label="t('common.remark')" :span="isMobile ? 1 : 2">{{ c.note }}</el-descriptions-item>
        </el-descriptions>

        <!-- 跟进时间线 -->
        <h3 class="page-title section">{{ t('crm.messages.followUpHistory') }}</h3>
        <el-empty v-if="!c.followUps.length" :description="t('crm.messages.noFollowUpRecordsYet')" :image-size="72" />
        <el-timeline v-else class="timeline">
          <el-timeline-item
            v-for="f in c.followUps"
            :key="f.id"
            :timestamp="fmtDateTime(f.createdAt)"
            placement="top"
            :type="f.isVisit ? 'success' : 'primary'"
            :hollow="!f.isVisit"
          >
            <div class="fu">
              <div class="fu-head">
                <b>{{ f.user.name }}</b>
                <el-tag size="small" effect="plain">{{ dict.label('followMethods', f.method) }}</el-tag>
                <el-tag v-if="f.isVisit" size="small" type="success">{{ t('crm.messages.visits') }}</el-tag>
                <DictTag v-if="f.intentLevel" dict="intentLevels" :value="f.intentLevel" />
                <span class="spacer" />
                <el-button v-if="canDeleteFollow(f)" link type="danger" size="small" @click="removeFollow(f)">{{ t('common.delete') }}</el-button>
              </div>
              <div class="fu-content">{{ f.content }}</div>
              <div v-if="f.nextFollowAt" class="muted">{{ t('crm.messages.nextFollowUpText', { v1: fmtDateTime(f.nextFollowAt) }) }}</div>
            </div>
          </el-timeline-item>
        </el-timeline>

        <!-- 快速跟进 -->
        <div v-if="canFollow" class="quick">
          <h3 class="page-title">{{ t('crm.messages.addFollowUp') }}</h3>
          <el-form label-position="top" size="default">
            <div class="quick-grid">
              <el-form-item :label="t('crm.messages.followUpMethod')"><DictSelect v-model="fu.method" dict="followMethods" :clearable="false" /></el-form-item>
              <el-form-item :label="t('crm.messages.interestLevel')"><DictSelect v-model="fu.intentLevel" dict="intentLevels" /></el-form-item>
              <el-form-item :label="t('crm.messages.nextFollowUp')">
                <el-date-picker
                  v-model="fu.nextFollowAt"
                  type="datetime"
                  format="YYYY-MM-DD HH:mm"
                  value-format="YYYY-MM-DD HH:mm"
                  :placeholder="t('crm.messages.optional')"
                  style="width: 100%"
                />
              </el-form-item>
            </div>
            <el-form-item :label="t('crm.messages.followUpDetails')">
              <el-input
                v-model="fu.content"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
                :placeholder="t('crm.messages.discussionPointsCustomerConcernsNextSteps')"
              />
            </el-form-item>
            <div class="quick-foot">
              <el-checkbox v-model="fu.isVisit">{{ t('crm.messages.thisWasAVisit') }}</el-checkbox>
              <span class="spacer" />
              <el-button type="primary" :loading="saving" @click="submitFollow">{{ t('crm.messages.saveFollowUp') }}</el-button>
            </div>
          </el-form>
        </div>
        <el-alert v-else-if="inPool && !deleted" type="info" :closable="false" show-icon :title="t('crm.messages.claimThisCustomerBeforeAddingFollowUps')" />
      </template>
    </div>
    <CustomerForm v-model="editOpen" :customer="c" @saved="onSaved" />
  </el-drawer>
</template>

<style scoped>
.wrap { min-height: 200px; padding: 4px 2px 24px; }
.head { display: flex; gap: 12px; align-items: flex-start; }
.avatar {
  width: 46px; height: 46px; border-radius: 12px; flex: none;
  background: linear-gradient(135deg, var(--xh-primary), var(--xh-teal)); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700;
}
.head-main { flex: 1; min-width: 0; }
.name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.name { font-size: 19px; font-weight: 700; }
.close { flex: none; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.actions .el-button { margin-left: 0; }
.info { margin-bottom: 8px; }
.section { margin-top: 18px; }
.link { color: var(--xh-primary); text-decoration: none; }
.timeline { padding-left: 2px; }
.fu { background: var(--el-fill-color-light); border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px 12px; }
.fu-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.fu-head .spacer, .quick-foot .spacer { flex: 1; }
.fu-content { white-space: pre-wrap; line-height: 1.6; margin-bottom: 2px; }
.quick { border-top: 1px dashed var(--xh-border); padding-top: 16px; margin-top: 8px; }
.quick-grid { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 0 10px; }
.quick-grid :deep(.el-select) { width: 100%; }
.quick-foot { display: flex; align-items: center; gap: 8px; }
@media (max-width: 767px) {
  .quick-grid { grid-template-columns: 1fr; }
}
</style>
