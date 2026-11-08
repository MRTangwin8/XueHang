<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 新建 / 编辑客户对话框。电话 / 微信 / QQ 失焦时查重。 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import DictTag from '@/components/DictTag.vue'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDialogWidth } from '@/utils/format'
import { fmtDateTime } from '@/utils/time'
import { crmApi, fromPicker, toPicker, type Customer, type DuplicateCustomer } from '../api'
import ChannelSelect from './ChannelSelect.vue'
import OrgSelect from './OrgSelect.vue'

const { t } = useI18n()

const props = defineProps<{ customer?: Customer | null; scope?: 'mine' | 'pool' | 'all' }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [c: Customer] }>()

const auth = useAuth()
const width = useDialogWidth('720px')
const formRef = ref<FormInstance>()
const saving = ref(false)
const dups = ref<DuplicateCustomer[]>([])
const isEdit = computed(() => !!props.customer)
const canAssignOwner = computed(() => !isEdit.value && auth.can('crm.customer.all'))

const blank = () => ({
  name: '',
  gender: null as string | null,
  phone: '',
  wechat: '',
  qq: '',
  email: '',
  province: '',
  city: '',
  education: null as string | null,
  currentSchool: '',
  subjectCategory: null as string | null,
  targetSchool: '',
  intentLevel: 'C',
  status: 'NEW',
  source: null as string | null,
  channelId: null as number | null,
  organizationId: null as number | null,
  campusId: null as number | null,
  nextFollowAt: null as string | null,
  note: '',
  toPool: false,
  ownerId: null as number | null,
})
const form = reactive(blank())

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('crm.messages.nameRequired'), trigger: 'blur' }],
  phone: [
    {
      validator: (_r, _v, cb) => (form.phone || form.wechat || form.qq || form.email ? cb() : cb(new Error(t('crm.messages.contactRequired')))),
      trigger: 'blur',
    },
  ],
}))

watch(visible, (v) => {
  if (!v) return
  dups.value = []
  Object.assign(form, blank())
  if (props.customer) {
    const c = props.customer
    Object.assign(form, {
      name: c.name, gender: c.gender, phone: c.phone ?? '', wechat: c.wechat ?? '', qq: c.qq ?? '', email: c.email ?? '',
      province: c.province ?? '', city: c.city ?? '', education: c.education, currentSchool: c.currentSchool ?? '',
      subjectCategory: c.subjectCategory, targetSchool: c.targetSchool ?? '', intentLevel: c.intentLevel, status: c.status,
      source: c.source, channelId: c.channelId, organizationId: c.organizationId, campusId: c.campusId, nextFollowAt: toPicker(c.nextFollowAt),
        note: c.note ?? '',
    })
  } else {
    form.campusId = auth.me?.campusId ?? null
    form.toPool = props.scope === 'pool'
  }
  formRef.value?.clearValidate()
})

async function checkDup() {
  if (!form.phone && !form.wechat && !form.qq) {
    dups.value = []
    return
  }
  try {
    dups.value = await crmApi.checkDuplicate({ phone: form.phone, wechat: form.wechat, qq: form.qq, excludeId: props.customer?.id })
  } catch {
    dups.value = []
  }
}

const matchLabel = computed<Record<string, string>>(() => ({
  phone: t('crm.messages.phone'),
  wechat: t('crm.messages.wechat'),
  qq: 'QQ',
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    const { toPool, ownerId, ...rest } = form
    const body: Record<string, unknown> = { ...rest, nextFollowAt: fromPicker(rest.nextFollowAt) }
    let c: Customer
    if (props.customer) {
      c = await crmApi.updateCustomer(props.customer.id, body)
      ElMessage.success(t('common.saved'))
    } else {
      if (toPool) body.toPool = true
      else if (ownerId) body.ownerId = ownerId
      c = await crmApi.createCustomer(body)
      ElMessage.success(toPool ? t('crm.messages.createdAndMovedToPool') : t('crm.messages.customerCreated'))
    }
    visible.value = false
    emit('saved', c)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('crm.messages.editCustomer') : t('crm.messages.newCustomer')"
    :width="width"
    :close-on-click-modal="false"
    append-to-body
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="cust-form">
      <el-alert v-if="dups.length" type="warning" :closable="false" show-icon class="dup-alert">
        <template #title>{{ t('crm.messages.duplicateWarning', { v1: dups.length }) }}</template>
        <div v-for="(d, i) in dups" :key="d.id ?? `r${i}`" class="dup-row">
          <b v-if="!d.restricted">{{ d.name }}</b>
          <b v-else>{{ t('crm.messages.existingCustomer') }}<span class="muted">{{ t('crm.messages.restrictedCustomer', { v1: d.campus?.name }) }}</span></b>
          <span class="muted">{{ t('crm.messages.matchingFields', { v1: d.matched.map((m) => matchLabel[m] ?? m).join('、') }) }}</span>
          <span>{{ t('crm.messages.ownerText', { v1: d.owner?.name ?? t('crm.messages.unassignedPool') }) }}</span>
          <DictTag dict="customerStatuses" :value="d.status" />
          <el-tag v-if="d.studentId" size="small" type="success">{{ t('crm.messages.enrolledAsStudent') }}</el-tag>
        </div>
      </el-alert>

      <div class="grid">
        <el-form-item :label="t('crm.messages.name')" prop="name"><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item :label="t('crm.messages.gender')"><DictSelect v-model="form.gender" dict="genders" radio /></el-form-item>
        <el-form-item :label="t('crm.messages.phone')" prop="phone"><el-input v-model="form.phone" @blur="checkDup" /></el-form-item>
        <el-form-item :label="t('crm.messages.wechat')"><el-input v-model="form.wechat" @blur="checkDup" /></el-form-item>
        <el-form-item label="QQ"><el-input v-model="form.qq" @blur="checkDup" /></el-form-item>
        <el-form-item :label="t('crm.messages.email')"><el-input v-model="form.email" /></el-form-item>
        <el-form-item :label="t('crm.messages.province')"><el-input v-model="form.province" /></el-form-item>
        <el-form-item :label="t('crm.messages.city')"><el-input v-model="form.city" /></el-form-item>
        <el-form-item :label="t('crm.messages.highestEducation')"><DictSelect v-model="form.education" dict="educations" /></el-form-item>
        <el-form-item :label="t('crm.messages.currentOrFormerSchool')"><el-input v-model="form.currentSchool" /></el-form-item>
        <el-form-item :label="t('crm.messages.subjectArea')"><DictSelect v-model="form.subjectCategory" dict="subjectCategories" /></el-form-item>
        <el-form-item :label="t('crm.messages.targetInstitution')"><el-input v-model="form.targetSchool" /></el-form-item>
        <el-form-item :label="t('crm.messages.interestLevel')"><DictSelect v-model="form.intentLevel" dict="intentLevels" :clearable="false" /></el-form-item>
        <el-form-item v-if="isEdit" :label="t('common.status')">
          <DictTag v-if="form.status === 'SIGNED'" dict="customerStatuses" value="SIGNED" />
          <DictSelect v-else v-model="form.status" dict="customerStatuses" :exclude="['SIGNED']" :clearable="false" />
        </el-form-item>
        <el-form-item :label="t('crm.messages.inquiryMethod')"><DictSelect v-model="form.source" dict="customerSources" /></el-form-item>
        <el-form-item :label="t('crm.messages.channel')"><ChannelSelect v-model="form.channelId" /></el-form-item>
        <el-form-item :label="t('crm.menu.partnerOrganizations')">
          <OrgSelect v-model="form.organizationId" :initial="customer?.organization ?? null" />
        </el-form-item>
        <el-form-item :label="t('common.campus')">
          <CampusSelect v-model="form.campusId" :placeholder="t('crm.messages.selectACampus')" :clearable="false" />
        </el-form-item>
        <el-form-item :label="t('crm.messages.nextFollowUp')">
          <el-date-picker
            v-model="form.nextFollowAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm"
            format="YYYY-MM-DD HH:mm"
            :placeholder="t('crm.messages.selectATime')"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" maxlength="1000" /></el-form-item>
      <template v-if="!isEdit">
        <el-form-item :label="t('crm.messages.assignment')">
          <el-checkbox v-model="form.toPool">{{ t('crm.messages.moveToPoolNoOwner') }}</el-checkbox>
        </el-form-item>
        <el-form-item v-if="canAssignOwner && !form.toPool" :label="t('crm.messages.owner')">
          <UserSelect v-model="form.ownerId" :placeholder="t('crm.messages.defaultsToMe')" />
        </el-form-item>
      </template>
      <p v-if="isEdit && customer" class="muted">{{
          t('crm.messages.createdByOwner', { v1: fmtDateTime(customer.createdAt), v2: customer.owner?.name ?? t('crm.messages.unassignedPool') })
      }}</p>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
.grid :deep(.el-select), .grid :deep(.el-date-editor) { width: 100%; }
.dup-alert { margin-bottom: 14px; }
.dup-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
@media (max-width: 767px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
