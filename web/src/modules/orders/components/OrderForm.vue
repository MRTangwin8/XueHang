<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 项目缴费表单（报名第二步 / 在籍学员「选课缴费」共用）。
 * <OrderForm ref="orderForm" />   await orderForm.value.validate(); orderForm.value.payload(studentId)
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import FileUpload from '@/components/FileUpload.vue'
import { useDict } from '@/stores/dict'
import { money } from '@/utils/format'
import { today, toApi } from '@/utils/time'
import { ordersApi, type OrderInput, type Product } from '../api'

const { t } = useI18n()

const props = defineProps<{ campusId?: number | null }>()
const dict = useDict()
const formEl = ref<FormInstance>()
const packages = ref<Product[]>([])
const singles = ref<Product[]>([])

const form = reactive({
  packageId: null as number | null,
  classMode: 'CLASS',
  vipHours: null as number | null,
  vipContent: '',
  extraProductIds: [] as number[],
  currency: 'JPY',
  discountAmount: 0,
  discountReason: null as string | null,
  signedAt: today() as string | null,
  expireAt: null as string | null,
  note: '',
  withPayment: false,
  payment: { amount: null as number | null, method: '\u94f6\u884c\u8f6c\u8d26', kind: '\u62a5\u540d\u7f34\u8d39', paidAt: today() as string | null,
    note: '', receiptUrl: null as string | null },
})

onMounted(async () => {
  dict.load()
  const [p, s] = await Promise.all([ordersApi.products({ type: 'PACKAGE', active: true }), ordersApi.products({ type: 'SINGLE', active: true })])
  const byCampus = (x: Product) => !props.campusId || !x.campusId || x.campusId === props.campusId
  packages.value = p.filter(byCampus)
  singles.value = s.filter(byCampus)
})

const pkg = computed(() => packages.value.find((p) => p.id === form.packageId) ?? null)
const extras = computed(() => singles.value.filter((s) => form.extraProductIds.includes(s.id)))
const hasVip = computed(() => form.classMode === 'VIP' || form.classMode === 'BOTH')
const extraSum = computed(() => extras.value.reduce((s, p) => s + p.price, 0))
const listAmount = computed(() => (pkg.value ? (pkg.value.originalPrice ?? pkg.value.price) : 0) + extraSum.value)
const payable = computed(() => (pkg.value ? pkg.value.price : 0) + extraSum.value - (form.discountAmount || 0))

watch(
  () => form.packageId,
  () => {
    if (pkg.value?.vipHours && !form.vipHours) form.vipHours = pkg.value.vipHours
    if (pkg.value?.vipHours && form.classMode === 'CLASS') form.classMode = 'BOTH'
  },
)

const rules = computed<FormRules>(() => ({
  packageId: [{ required: true, message: t('orders.messages.selectATuitionPackage'), trigger: 'change' }],
  classMode: [{ required: true, message: t('orders.messages.selectAClassAssignment'), trigger: 'change' }],
  vipHours: [
    {
      validator: (_r, _v, cb) => (hasVip.value && !(form.vipHours && form.vipHours > 0) ? cb(new Error(t('orders.messages.enterVipHours'))) : cb()),
      trigger: 'blur',
    },
  ],
  vipContent: [
    { validator: (_r, _v, cb) => (hasVip.value && !form.vipContent.trim() ? cb(new Error(t('orders.messages.enterVipCourseContent'))) : cb()),
      trigger: 'blur' },
  ],
  discountReason: [
    { validator: (_r, _v, cb) => (form.discountAmount > 0 && !form.discountReason ? cb(new Error(t('orders.messages.selectADiscountReason'))) :
      cb()), trigger: 'change' },
  ],
}))

async function validate(): Promise<boolean> {
  const ok = await formEl.value?.validate().catch(() => false)
  if (!ok) {
    ElMessage.warning(t('orders.messages.completeTheCoursePaymentDetails'))
    return false
  }
  if (payable.value < 0) {
    ElMessage.warning(t('orders.messages.theDiscountCannotExceedTheAmountDue'))
    return false
  }
  if (form.withPayment && !(form.payment.amount && form.payment.amount > 0)) {
    ElMessage.warning(t('orders.messages.enterTheInitialPaymentAmount'))
    return false
  }
  return true
}

function payload(studentId: number): OrderInput {
  return {
    studentId,
    packageId: form.packageId,
    classMode: form.classMode,
    vipHours: hasVip.value ? form.vipHours : null,
    vipContent: hasVip.value ? form.vipContent.trim() : null,
    extraProductIds: form.extraProductIds,
    currency: form.currency,
    discountAmount: form.discountAmount || 0,
    discountReason: form.discountAmount > 0 ? form.discountReason : null,
    signedAt: form.signedAt ? toApi(form.signedAt) : null,
    expireAt: form.expireAt ? toApi(form.expireAt) : null,
    note: form.note || null,
    firstPayment: form.withPayment
      ? {
          amount: form.payment.amount,
          method: form.payment.method,
          kind: form.payment.kind,
          paidAt: form.payment.paidAt ? toApi(form.payment.paidAt, '12:00') : null,
          note: form.payment.note || null,
          receiptUrl: form.payment.receiptUrl,
        }
      : null,
  }
}

const packageName = computed(() => pkg.value?.name ?? '')
defineExpose({ validate, payload, packageName })
</script>

<template>
  <el-form ref="formEl" :model="form" :rules="rules" label-position="top" scroll-to-error class="order-form">
    <section class="of-section">
      <h4 class="of-title"><el-icon><Collection /></el-icon>{{ t('orders.messages.tuitionPackageAndClassAssignment') }}</h4>
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item :label="t('orders.messages.tuitionPackage')" prop="packageId">
            <el-select v-model="form.packageId" filterable :placeholder="t('orders.messages.selectTuitionPackage')" style="width: 100%">
              <el-option v-for="p in packages" :key="p.id" :value="p.id" :label="p.name">
                <span>{{ p.name }}</span>
                <span class="muted" style="float: right">{{ money(p.price, form.currency) }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="t('orders.messages.classAssignment')" prop="classMode">
            <DictSelect v-model="form.classMode" dict="classModes" radio />
          </el-form-item>
        </el-col>
      </el-row>
      <div v-if="pkg" class="pkg-info">
        <div class="pkg-price">
          <span class="now">{{ money(pkg.price, form.currency) }}</span>
          <span v-if="pkg.originalPrice && pkg.originalPrice !== pkg.price" class="orig">{{ money(pkg.originalPrice, form.currency) }}</span>
          <el-tag v-if="pkg.vipHours" size="small" type="warning" disable-transitions>{{ t('orders.messages.includesVipHours', { p1: pkg.vipHours }) }}</el-tag>
        </div>
        <div v-if="pkg.items.length" class="pkg-items">
          {{ t('orders.messages.includedCourses') }}
          <el-tag v-for="i in pkg.items" :key="i.id" size="small" effect="plain" disable-transitions>
            {{ i.name }}
          </el-tag>
        </div>
        <div v-if="pkg.description" class="muted">{{ pkg.description }}</div>
      </div>
      <el-row v-if="hasVip" :gutter="16" class="vip-row">
        <el-col :xs="24" :sm="8">
          <el-form-item :label="t('orders.messages.vipHours')" prop="vipHours" required>
            <el-input-number v-model="form.vipHours" :min="0.5" :step="1" :precision="1" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="16">
          <el-form-item :label="t('orders.messages.vipCourseContent')" prop="vipContent" required>
            <el-input v-model="form.vipContent" :placeholder="t('orders.messages.eGEjuJapaneseTutoringGraduateEconomics')" />
          </el-form-item>
        </el-col>
      </el-row>
    </section>
    <section class="of-section">
      <h4 class="of-title"><el-icon><Money /></el-icon>{{ t('orders.messages.fees') }}</h4>
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item :label="t('orders.messages.additionalSingleTermCourses')">
            <el-select
              v-model="form.extraProductIds"
              multiple
              filterable
              clearable
              :placeholder="t('orders.messages.multipleSelectionsAllowed')"
              style="width: 100%"
            >
              <el-option v-for="s in singles" :key="s.id" :value="s.id" :label="s.name">
                <span>{{ s.name }}</span>
                <span class="muted" style="float: right">{{ money(s.price, form.currency) }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="t('orders.messages.currency')"><DictSelect v-model="form.currency" dict="currencies" radio /></el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.discountAmount')">
            <el-input-number v-model="form.discountAmount" :min="0" :step="1000" :controls="false" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.discountReason')" prop="discountReason">
            <DictSelect v-model="form.discountReason" dict="discountReasons" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.contractDate')">
            <el-date-picker v-model="form.signedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.validUntil')">
            <el-date-picker v-model="form.expireAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24"><el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item></el-col>
      </el-row>
      <div class="amount-bar">
        <div><span class="muted">{{ t('orders.messages.listPriceTotal') }}</span><b>{{ money(listAmount, form.currency) }}</b></div>
        <div v-if="form.discountAmount">
          <span class="muted">
            {{ t('orders.messages.discount') }}
          </span>
          <b class="text-danger">
            -
            {{ money(form.discountAmount, form.currency) }}
          </b>
        </div>
        <div class="payable"><span class="muted">{{ t('orders.messages.amountDue') }}</span><b>{{ money(payable, form.currency) }}</b></div>
      </div>
    </section>
    <section class="of-section">
      <h4 class="of-title">
        <el-icon><Wallet /></el-icon>
        {{ t('orders.messages.initialPayment') }}
        <el-switch v-model="form.withPayment" size="small" style="margin-left: 8px" />
        <span class="muted" style="font-weight: 400">{{ form.withPayment ? '' : t('orders.messages.canBeRecordedLaterInTheOrder') }}</span>
      </h4>
      <el-row v-if="form.withPayment" :gutter="16">
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.amount')" required>
            <el-input-number v-model="form.payment.amount" :min="1" :step="1000" :controls="false" style="width: 100%" />
            <el-button link type="primary" size="small" @click="form.payment.amount = payable > 0 ? payable : null">
              {{ t('orders.messages.fullAmount') }}
            </el-button>
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.method')">
            <DictSelect v-model="form.payment.method" dict="paymentMethods" :clearable="false" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.category')">
            <DictSelect v-model="form.payment.kind" dict="paymentKinds" :clearable="false" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item :label="t('orders.messages.paymentDate')">
            <el-date-picker v-model="form.payment.paidAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12"><el-form-item :label="t('orders.messages.paymentNotes')"><el-input v-model="form.payment.note" /></el-form-item></el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="t('orders.messages.receipt')">
            <FileUpload kind="image" :button-text="t('orders.messages.uploadReceiptImage')" @uploaded="(f) => (form.payment.receiptUrl = f.url)" />
          </el-form-item>
        </el-col>
      </el-row>
    </section>
  </el-form>
</template>

<style scoped>
.of-section { padding: 4px 0 8px; }
.of-section + .of-section { border-top: 1px dashed var(--xh-border); padding-top: 16px; margin-top: 4px; }
.of-title { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 15px; font-weight: 650; color: var(--xh-primary); flex-wrap: wrap; }
.order-form :deep(.el-form-item) { margin-bottom: 14px; }
.pkg-info { background: var(--xh-primary-soft); border-radius: 10px; padding: 10px 14px; margin: -4px 0 14px; display: grid; gap: 6px; }
.pkg-price { display: flex; align-items: baseline; gap: 10px; }
.pkg-price .now { font-size: 18px; font-weight: 700; color: var(--xh-primary); }
.pkg-price .orig { text-decoration: line-through; color: var(--xh-text-2); }
.pkg-items { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; }
.vip-row { background: var(--xh-kind-vip-bg); border-radius: 10px; padding: 10px 6px 0; margin: 0 0 8px !important; }
.amount-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: flex-end;
  align-items: baseline;
  padding: 10px 14px;
  background: #f7f8fc;
  border-radius: 10px;
}
.amount-bar > div { display: flex; gap: 6px; align-items: baseline; }
.amount-bar b { font-size: 15px; }
.amount-bar .payable b { font-size: 20px; color: var(--xh-primary); }
</style>
