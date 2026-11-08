<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 新建 / 编辑合作机构。返点比例以 % 输入，提交时换算为 0~1。 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { useDialogWidth } from '@/utils/format'
import { crmApi, fromPicker, toPicker, type Organization } from '../api'

const { t } = useI18n()

const props = defineProps<{ org?: Organization | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [o: Organization] }>()
const width = useDialogWidth('720px')
const formRef = ref<FormInstance>()
const saving = ref(false)
const isEdit = computed(() => !!props.org)

const blank = () => ({
  name: '', type: null as string | null, campusId: null as number | null, province: '', city: '', address: '',
  contactName: '', contactPhone: '', wechat: '', rebateRule: '', rateClass: null as number | null, rateVip: null as number | null,
  bankName: '', bankAccount: '', bankHolder: '', status: 'POTENTIAL', signedAt: null as string | null, ownerId: null as number | null, note: '',
})
const form = reactive(blank())
const toPct = (v: number | null) => (v == null ? null : Math.round(v * 10000) / 100)

watch(visible, (v) => {
  if (!v) return
  Object.assign(form, blank())
  const o = props.org
  if (o) {
    Object.assign(form, {
      name: o.name, type: o.type, campusId: o.campusId, province: o.province ?? '', city: o.city ?? '', address: o.address ?? '',
      contactName: o.contactName ?? '', contactPhone: o.contactPhone ?? '', wechat: o.wechat ?? '', rebateRule: o.rebateRule ?? '',
      rateClass: toPct(o.rebateRateClass), rateVip: toPct(o.rebateRateVip), bankName: o.bankName ?? '', bankAccount: o.bankAccount ?? '',
      bankHolder: o.bankHolder ?? '', status: o.status, signedAt: toPicker(o.signedAt)?.slice(0, 10) ?? null, ownerId: o.ownerId, note: o.note ?? '',
    })
  }
  formRef.value?.clearValidate()
})

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    const { rateClass, rateVip, signedAt, ...rest } = form
    const body = {
      ...rest,
      rebateRateClass: rateClass == null ? null : rateClass / 100,
      rebateRateVip: rateVip == null ? null : rateVip / 100,
      signedAt: signedAt ? fromPicker(`${signedAt} 00:00`) : null,
    }
    const o = props.org ? await crmApi.updateOrganization(props.org.id, body) : await crmApi.createOrganization(body)
    ElMessage.success(t('common.saved'))
    visible.value = false
    emit('saved', o)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('crm.messages.editPartnerOrganization') : t('crm.messages.addPartnerOrganization')"
    :width="width"
    :close-on-click-modal="false"
    append-to-body
  >
    <el-form ref="formRef" :model="form" label-width="96px">
      <div class="grid">
        <el-form-item
          :label="t('crm.messages.organizationName')"
          prop="name"
          :rules="[{ required: true, message: t('crm.messages.enterTheOrganizationName'), trigger: 'blur' }]"
          class="span2"
        >
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('crm.messages.type')"><DictSelect v-model="form.type" dict="organizationTypes" /></el-form-item>
        <el-form-item :label="t('crm.messages.partnershipStatus')">
          <DictSelect v-model="form.status" dict="organizationStatuses" :clearable="false" />
        </el-form-item>
        <el-form-item :label="t('crm.messages.province')"><el-input v-model="form.province" /></el-form-item>
        <el-form-item :label="t('crm.messages.city')"><el-input v-model="form.city" /></el-form-item>
        <el-form-item :label="t('crm.messages.address')" class="span2"><el-input v-model="form.address" /></el-form-item>
        <el-form-item :label="t('crm.messages.contactPerson')"><el-input v-model="form.contactName" /></el-form-item>
        <el-form-item :label="t('crm.messages.contactPhone')"><el-input v-model="form.contactPhone" /></el-form-item>
        <el-form-item :label="t('crm.messages.wechat')"><el-input v-model="form.wechat" /></el-form-item>
        <el-form-item :label="t('crm.messages.contractDate')">
          <el-date-picker v-model="form.signedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </div>
      <el-divider content-position="left">{{ t('crm.messages.commission') }}</el-divider>
      <div class="grid">
        <el-form-item :label="t('crm.messages.groupClassCommission')">
          <el-input-number v-model="form.rateClass" :min="0" :max="100" :precision="1" :step="1" controls-position="right" /><span class="unit">%</span>
        </el-form-item>
        <el-form-item :label="t('crm.messages.vipCommission')">
          <el-input-number v-model="form.rateVip" :min="0" :max="100" :precision="1" :step="1" controls-position="right" /><span class="unit">%</span>
        </el-form-item>
        <el-form-item :label="t('crm.messages.commissionTerms')" class="span2"><el-input
          v-model="form.rebateRule"
          :placeholder="t('crm.messages.commissionPlaceholder')"
        /></el-form-item>
        <el-form-item :label="t('crm.messages.bank')"><el-input v-model="form.bankName" /></el-form-item>
        <el-form-item :label="t('crm.messages.accountHolder')"><el-input v-model="form.bankHolder" /></el-form-item>
        <el-form-item :label="t('crm.messages.bankAccountNumber')" class="span2"><el-input v-model="form.bankAccount" /></el-form-item>
      </div>
      <el-divider content-position="left">{{ t('crm.messages.assignment') }}</el-divider>
      <div class="grid">
        <el-form-item :label="t('crm.messages.owner')"><UserSelect v-model="form.ownerId" :placeholder="t('crm.messages.defaultsToMe')" /></el-form-item>
        <el-form-item :label="t('common.campus')"><CampusSelect v-model="form.campusId" :placeholder="t('crm.messages.defaultsToMyCampus')" /></el-form-item>
      </div>
      <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
.grid .span2 { grid-column: span 2; }
.grid :deep(.el-select) { width: 100%; }
.unit { margin-left: 6px; color: var(--xh-text-2); }
@media (max-width: 767px) {
  .grid { grid-template-columns: 1fr; }
  .grid .span2 { grid-column: auto; }
}
</style>
