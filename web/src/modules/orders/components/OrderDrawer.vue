<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 订单详情抽屉：明细 / 缴费记录 / 登记缴费 / 退费 / 调整 / 作废。<OrderDrawer v-model="show" :order-id="id" @changed="reload" /> */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import DictSelect from '@/components/DictSelect.vue'
import FileUpload from '@/components/FileUpload.vue'
import { useDict } from '@/stores/dict'
import { money, hours, useIsMobile, useDialogWidth } from '@/utils/format'
import { fmtDate, fmtDateTime, today, toApi } from '@/utils/time'
import { ordersApi, type OrderDetail } from '../api'

const { t } = useI18n()

const props = defineProps<{ orderId: number | null }>()
const emit = defineEmits<{ changed: [] }>()
const visible = defineModel<boolean>({ default: false })
const router = useRouter()
const dict = useDict()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('480px')
const o = ref<OrderDetail | null>(null)
const loading = ref(false)

async function load() {
  if (!props.orderId) return
  loading.value = true
  try {
    o.value = await ordersApi.get(props.orderId)
  } finally {
    loading.value = false
  }
}
watch(
  () => [visible.value, props.orderId],
  () => {
    if (visible.value) load()
  },
  { immediate: true },
)

const cur = computed(() => o.value?.currency ?? 'JPY')
const balance = computed(() => (o.value ? o.value.payableAmount - o.value.paidAmount : 0))
const refundable = computed(() => (o.value ? o.value.paidAmount - o.value.refundedAmount : 0))
function changed() {
  load()
  emit('changed')
}

// ---------- 登记缴费 ----------
const payDlg = ref(false)
const pay = reactive({ amount: null as number | null, method: '\u94f6\u884c\u8f6c\u8d26', kind: '\u62a5\u540d\u7f34\u8d39\u8865\u6b3e', paidAt:
  today() as string | null, note: '', receiptUrl: null as string | null })
function openPay() {
  Object.assign(pay, { amount: balance.value > 0 ? balance.value : null, method: '\u94f6\u884c\u8f6c\u8d26', kind: o.value?.payments.length ?
    '\u62a5\u540d\u7f34\u8d39\u8865\u6b3e' : '\u62a5\u540d\u7f34\u8d39', paidAt: today(), note: '', receiptUrl: null })
  payDlg.value = true
}
async function submitPay() {
  if (!o.value) return
  if (!pay.amount || pay.amount <= 0) return ElMessage.warning(t('orders.messages.enterAPaymentAmount'))
  await ordersApi.pay(o.value.id, { ...pay, paidAt: pay.paidAt ? toApi(pay.paidAt, '12:00') : null, note: pay.note || null })
  ElMessage.success(t('orders.messages.paymentRecorded'))
  payDlg.value = false
  changed()
}

// ---------- 退费 ----------
const refundDlg = ref(false)
const rf = reactive({ amount: null as number | null, method: '\u94f6\u884c\u8f6c\u8d26' as string | null, refundedAt: today() as string | null, reason: '' })
function openRefund() {
  Object.assign(rf, { amount: null, method: '\u94f6\u884c\u8f6c\u8d26', refundedAt: today(), reason: '' })
  refundDlg.value = true
}
async function submitRefund() {
  if (!o.value) return
  if (!rf.amount || rf.amount <= 0) return ElMessage.warning(t('orders.messages.enterARefundAmount'))
  if (rf.amount > refundable.value) return ElMessage.warning(t('orders.messages.maximumRefund', { p1: money(refundable.value, cur.value) }))
  await ElMessageBox.confirm(t('orders.messages.confirmARefundOf', { p1: money(rf.amount, cur.value) }), t('orders.messages.confirmRefund'), { type:
    'warning' })
  await ordersApi.refund(o.value.id, { ...rf, refundedAt: rf.refundedAt ? toApi(rf.refundedAt, '12:00') : null, reason: rf.reason || null })
  ElMessage.success(t('orders.messages.refundRecorded'))
  refundDlg.value = false
  changed()
}

// ---------- 调整（优惠 / 有效期 / 备注） ----------
const editDlg = ref(false)
const ed = reactive({ discountAmount: 0, discountReason: null as string | null, expireAt: null as string | null, note: '' })
function openEdit() {
  if (!o.value) return
  Object.assign(ed, { discountAmount: o.value.discountAmount, discountReason: o.value.discountReason, expireAt: o.value.expireAt ?
    fmtDate(o.value.expireAt) : null, note: o.value.note ?? '' })
  editDlg.value = true
}
async function submitEdit() {
  if (!o.value) return
  if (ed.discountAmount > 0 && !ed.discountReason) return ElMessage.warning(t('orders.messages.selectADiscountReason'))
  await ordersApi.update(o.value.id, { discountAmount: ed.discountAmount || 0, discountReason: ed.discountAmount > 0 ? ed.discountReason : null,
    expireAt: ed.expireAt ? toApi(ed.expireAt) : null, note: ed.note || null })
  ElMessage.success(t('common.saved'))
  editDlg.value = false
  changed()
}

async function cancelOrder() {
  if (!o.value) return
  await ElMessageBox.confirm(t('orders.messages.voidedOrdersCannotBeRestoredVipHour'), t('orders.messages.voidOrder'), { type: 'warning' })
  await ordersApi.cancel(o.value.id)
  ElMessage.success(t('orders.messages.orderVoided'))
  changed()
}

async function deletePayment(pid: number) {
  await ElMessageBox.confirm(t('orders.messages.deleteThisPaymentRecordOnlyRecordsEntered'), t('orders.messages.deletePayment'), { type: 'warning' })
  await ordersApi.deletePayment(pid)
  ElMessage.success(t('common.deleted'))
  changed()
}
</script>

<template>
  <el-drawer v-model="visible" :size="isMobile ? '100%' : '720px'" destroy-on-close>
    <template #header>
      <div class="dr-head">
        <span>{{ t('orders.messages.order', { p1: o?.orderNo }) }}</span>
        <DictTag v-if="o" dict="orderStatuses" :value="o.status" />
      </div>
    </template>
    <div v-loading="loading" class="dr-body">
      <template v-if="o">
        <div class="actions">
          <el-button v-if="o.access.canPay" type="primary" icon="Wallet" @click="openPay">{{ t('orders.messages.recordPayment') }}</el-button>
          <el-button v-if="o.access.canRefund" icon="RefreshLeft" @click="openRefund">{{ t('orders.messages.refund') }}</el-button>
          <el-button v-if="o.access.canEdit" icon="Edit" @click="openEdit">{{ t('orders.messages.adjustDiscountNotes') }}</el-button>
          <el-button v-if="o.access.canCancel" type="danger" plain icon="CircleClose" @click="cancelOrder">{{ t('orders.messages.void') }}</el-button>
        </div>
        <div class="money-grid">
          <div><span>{{ t('orders.messages.amountDue') }}</span><b>{{ money(o.payableAmount, cur) }}</b></div>
          <div><span>{{ t('orders.messages.paid') }}</span><b class="text-success">{{ money(o.paidAmount, cur) }}</b></div>
          <div><span>{{ t('orders.messages.outstanding') }}</span><b :class="{ 'text-danger': balance > 0 }">{{ money(Math.max(balance, 0), cur) }}</b></div>
          <div v-if="o.refundedAmount"><span>{{ t('orders.messages.refunded') }}</span><b>{{ money(o.refundedAmount, cur) }}</b></div>
        </div>
        <el-descriptions :column="isMobile ? 1 : 2" border size="small" class="desc">
          <el-descriptions-item :label="t('orders.messages.student')">
            <el-button link type="primary" @click="router.push(`/students/${o.student.id}`)">{{ o.student.name }}（{{ o.student.studentNo }}）</el-button>
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.campus')">{{ o.campus?.name }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.tuitionPackage')">{{ o.package?.name ?? '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.classAssignment')">{{ dict.label('classModes', o.classMode) }}</el-descriptions-item>
          <el-descriptions-item v-if="o.classMode !== 'CLASS'" :label="t('orders.messages.vipHours')">{{ hours(o.vipHours) }}</el-descriptions-item>
          <el-descriptions-item v-if="o.classMode !== 'CLASS'" :label="t('orders.messages.vipContent')">{{ o.vipContent }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.listPriceTotal')">{{ money(o.listAmount, cur) }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.discount')">
            {{ o.discountAmount ? `${money(o.discountAmount, cur)}（${o.discountReason ?? ''}）` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.contractDate')">{{ fmtDate(o.signedAt) }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.validUntil')">{{ fmtDate(o.expireAt) || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.sales')">{{ o.sales?.name ?? '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('orders.messages.currency')">{{ dict.label('currencies', o.currency) }}</el-descriptions-item>
          <el-descriptions-item v-if="o.note" :label="t('common.remark')" :span="2">{{ o.note }}</el-descriptions-item>
        </el-descriptions>
        <h3 class="page-title sec">{{ t('orders.messages.orderItems') }}</h3>
        <el-table :data="o.items" size="small">
          <el-table-column prop="name" :label="t('orders.messages.item')" min-width="180" />
          <el-table-column :label="t('orders.messages.amount')" width="120" align="right">
            <template #default="{ row }">
              {{ money(row.price, cur) }}
            </template>
          </el-table-column>
        </el-table>
        <template v-if="o.vipPackages.length">
          <h3 class="page-title sec">{{ t('orders.messages.vipHourPackages') }}</h3>
          <el-table :data="o.vipPackages" size="small">
            <el-table-column prop="name" :label="t('orders.messages.name')" min-width="160" />
            <el-table-column prop="subject" :label="t('orders.messages.content')" min-width="120" />
            <el-table-column :label="t('orders.messages.totalUsedPending')" width="150">
              <template #default="{ row }">
                {{ hours(row.totalHours) }}
                /
                {{ hours(row.usedHours) }}
                /
                {{ hours(row.pendingHours) }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <h3 class="page-title sec">{{ t('orders.messages.paymentHistory') }}</h3>
        <el-table :data="o.payments" size="small" :empty-text="t('orders.messages.noPayments')">
          <el-table-column :label="t('orders.messages.date')" width="100"><template #default="{ row }">{{ fmtDate(row.paidAt) }}</template></el-table-column>
          <el-table-column :label="t('orders.messages.category')" min-width="110">
            <template #default="{ row }">{{ dict.label('paymentKinds', row.kind) }}</template>
          </el-table-column>
          <el-table-column :label="t('orders.messages.method')" width="90">
            <template #default="{ row }">{{ dict.label('paymentMethods', row.method) }}</template>
          </el-table-column>
          <el-table-column :label="t('orders.messages.amount')" width="110" align="right">
            <template #default="{ row }">
              {{ money(row.amount, row.currency) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('orders.messages.handledBy')" width="80"><template #default="{ row }">{{ row.payee?.name }}</template></el-table-column>
          <el-table-column label="" width="90">
            <template #default="{ row }">
              <el-link v-if="row.receiptUrl" :href="row.receiptUrl" target="_blank" type="primary" :underline="false">
                {{ t('orders.messages.receipt') }}
              </el-link>
              <el-button v-if="row.deletable" link type="danger" size="small" @click="deletePayment(row.id)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <template v-if="o.refunds.length">
          <h3 class="page-title sec">{{ t('orders.messages.refundHistory') }}</h3>
          <el-table :data="o.refunds" size="small">
            <el-table-column :label="t('orders.messages.date')" width="100">
              <template #default="{ row }">
                {{ fmtDate(row.refundedAt) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('orders.messages.amount')" width="110" align="right">
              <template #default="{ row }">
                {{ money(row.amount, row.currency) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('orders.messages.method')" width="90">
              <template #default="{ row }">{{ dict.label('paymentMethods', row.method) }}</template>
            </el-table-column>
            <el-table-column prop="reason" :label="t('orders.messages.reason')" min-width="140" />
            <el-table-column :label="t('orders.messages.operator')" width="80">
              <template #default="{ row }">
                {{ row.operator?.name }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <div class="muted foot">{{ t('orders.messages.created', { p1: fmtDateTime(o.createdAt) }) }}</div>
      </template>
    </div>
    <!-- 登记缴费 -->
    <el-dialog v-model="payDlg" :title="t('orders.messages.recordPayment')" :width="dlgWidth" append-to-body>
      <el-form label-width="80px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item :label="t('orders.messages.amount')" required>
          <el-input-number v-model="pay.amount" :min="1" :step="1000" :controls="false" style="width: 100%" />
          <div class="muted">{{ t('orders.messages.outstanding2', { p1: money(Math.max(balance, 0), cur) }) }}</div>
        </el-form-item>
        <el-form-item :label="t('orders.messages.method')">
          <DictSelect v-model="pay.method" dict="paymentMethods" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.category')">
          <DictSelect v-model="pay.kind" dict="paymentKinds" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.date')">
          <el-date-picker v-model="pay.paidAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="pay.note" /></el-form-item>
        <el-form-item :label="t('orders.messages.receipt')">
          <FileUpload kind="image" :button-text="t('orders.messages.uploadReceiptImage')" @uploaded="(f) => (pay.receiptUrl = f.url)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitPay">{{ t('orders.messages.confirmPayment') }}</el-button>
      </template>
    </el-dialog>
    <!-- 退费 -->
    <el-dialog v-model="refundDlg" :title="t('orders.messages.refund')" :width="dlgWidth" append-to-body>
      <el-form label-width="80px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item :label="t('orders.messages.amount')" required>
          <el-input-number v-model="rf.amount" :min="1" :max="refundable" :controls="false" style="width: 100%" />
          <div class="muted">{{ t('orders.messages.maximumRefund', { p1: money(refundable, cur) }) }}</div>
        </el-form-item>
        <el-form-item :label="t('orders.messages.method')"><DictSelect v-model="rf.method" dict="paymentMethods" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('orders.messages.date')">
          <el-date-picker v-model="rf.refundedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.reason')"><el-input v-model="rf.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="submitRefund">{{ t('orders.messages.confirmRefund2') }}</el-button>
      </template>
    </el-dialog>
    <!-- 调整 -->
    <el-dialog v-model="editDlg" :title="t('orders.messages.adjustOrder')" :width="dlgWidth" append-to-body>
      <el-form label-width="80px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item :label="t('orders.messages.discountAmount')">
          <el-input-number v-model="ed.discountAmount" :min="0" :step="1000" :controls="false" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.discountReason')">
          <DictSelect v-model="ed.discountReason" dict="discountReasons" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.validUntil')">
          <el-date-picker v-model="ed.expireAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="ed.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitEdit">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.dr-head { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 650; color: var(--xh-text); }
.dr-body { min-height: 200px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.actions .el-button { margin-left: 0; }
.money-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
.money-grid > div { background: #f7f8fc; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.money-grid span { color: var(--xh-text-2); font-size: 12px; }
.money-grid b { font-size: 18px; }
.desc { margin-bottom: 6px; }
.sec { margin-top: 18px; }
.foot { margin-top: 14px; text-align: right; }
</style>
