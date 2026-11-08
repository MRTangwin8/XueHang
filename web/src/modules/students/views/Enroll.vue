<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * 新学员报名：① 学员档案 → ② 项目缴费 → 完成（显示学号与学生端初始密码，仅显示一次）。
 * 支持 ?customerId= 从客户信息预填（客户模块接口不可用时忽略）。
 * 第一步只做本地校验；第二步提交时依次创建学员与订单，订单失败可重试（不会重复建档）。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { http } from '@/api/http'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { useIsMobile } from '@/utils/format'
import OrderForm from '@/modules/orders/components/OrderForm.vue'
import { ordersApi } from '@/modules/orders/api'
import StudentForm from '../components/StudentForm.vue'
import { emptyStudentForm, studentPayload, studentsApi, type StudentFormModel } from '../api'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()

const step = ref(0)
const form = ref<StudentFormModel>(emptyStudentForm())
const studentRef = ref<InstanceType<typeof StudentForm>>()
const orderRef = ref<InstanceType<typeof OrderForm>>()
const saving = ref(false)
const customer = ref<{ id: number; name: string } | null>(null)
/** 已创建的学员（第二步订单失败后重试时复用） */
const created = ref<{ id: number; studentNo: string; initialPassword: string } | null>(null)
const result = ref<{ orderNo: string; packageName: string } | null>(null)

interface CustomerLite {
  id: number; name: string; gender: string | null; phone: string | null; wechat: string | null; qq: string | null; email: string | null
  campusId: number | null; education: string | null; currentSchool: string | null; subjectCategory: string | null; targetSchool: string | null
  channelId: number | null; organizationId: number | null; ownerId: number | null; studentId: number | null
}

function resetAll() {
  form.value = emptyStudentForm()
  form.value.salesId = auth.me?.id ?? null
  form.value.campusId = auth.me?.campusId ?? null
  step.value = 0
  created.value = null
  result.value = null
  customer.value = null
}

async function prefill() {
  const cid = Number(route.query.customerId)
  if (!cid) return
  try {
    const c = (await http.get<CustomerLite>(`/crm/customers/${cid}`, { silent: true } as object)).data
    if (c.studentId) {
      ElMessage.warning(t('students.messages.customerIsAlreadyAStudent', { p1: c.name }))
      return
    }
    customer.value = { id: c.id, name: c.name }
    const f = form.value
    f.name = c.name ?? ''
    f.gender = c.gender
    f.phone = c.phone ?? ''
    f.wechat = c.wechat ?? ''
    f.qq = c.qq ?? ''
    f.email = c.email ?? ''
    if (c.campusId) f.campusId = c.campusId
    if (c.education && dict.options('educations').some((o) => o.value === c.education)) f.education = c.education
    if (c.subjectCategory && dict.options('subjectCategories').some((o) => o.value === c.subjectCategory)) f.subjectCategory = c.subjectCategory
    if (c.currentSchool) f.languageSchool = c.currentSchool
    if (c.targetSchool) f.targetUniversity = c.targetSchool
    f.channelId = c.channelId
    f.organizationId = c.organizationId
    if (c.ownerId) f.salesId = c.ownerId
  } catch {
    // 客户模块不可用或无权限：忽略预填
  }
}

onMounted(async () => {
  await dict.load()
  resetAll()
  await prefill()
})

async function next() {
  if (await studentRef.value?.validate()) {
    step.value = 1
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
function back() {
  step.value = 0
  window.scrollTo({ top: 0 })
}

async function submit() {
  if (!orderRef.value || !(await orderRef.value.validate())) return
  saving.value = true
  try {
    if (!created.value) {
      created.value = await studentsApi.create({ ...studentPayload(form.value), customerId: customer.value?.id ?? null })
    } else {
      // 订单失败后重试：同步可能修改过的档案
      await studentsApi.update(created.value.id, studentPayload(form.value)).catch(() => undefined)
    }
    const packageName = orderRef.value.packageName
    const o = await ordersApi.create(orderRef.value.payload(created.value.id))
    result.value = { orderNo: o.orderNo, packageName }
    step.value = 2
    window.scrollTo({ top: 0 })
  } catch {
    if (created.value) ElMessage.warning(t('students.messages.studentRecordCreatedCorrectThePaymentDetails', { p1: created.value.studentNo }))
  } finally {
    saving.value = false
  }
}

async function copyAccount() {
  if (!created.value) return
  const text = t('students.messages.studentIdNinitialPasswordNstudentPortalPortal', { p1: created.value.studentNo, p2: created.value.initialPassword,
    p3: location.origin })
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('students.messages.copied'))
  } catch {
    ElMessage.info(text)
  }
}
</script>

<template>
  <div class="page enroll">
    <div class="page-card steps-card">
      <el-steps :active="step" finish-status="success" align-center :simple="isMobile">
        <el-step :title="t('students.messages.studentRecord')" />
        <el-step :title="t('students.messages.coursePayment')" />
        <el-step :title="t('students.messages.complete')" />
      </el-steps>
    </div>
    <el-alert v-if="customer && step < 2" type="info" show-icon :closable="false" class="tip">
      {{ t('students.messages.prefilledFromCustomerTheCustomerWillBe', { p1: customer.name }) }}
    </el-alert>
    <!-- ① 学员档案（用 v-show 保留填写内容） -->
    <div v-show="step === 0" class="page-card">
      <h3 class="page-title">{{ t('students.messages.studentRecord') }}</h3>
      <StudentForm ref="studentRef" v-model="form" />
      <div class="foot-bar">
        <el-button @click="router.back()">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="next">
          {{ t('students.messages.nextCoursePayment') }}
          <el-icon class="el-icon--right">
            <ArrowRight />
          </el-icon>
        </el-button>
      </div>
    </div>
    <!-- ② 项目缴费 -->
    <div v-show="step === 1" class="page-card">
      <h3 class="page-title">
        {{ t('students.messages.coursePayment') }}
        <span class="muted" style="font-weight: 400">
          {{ form.name }}
          ·
          {{ form.languageSchool }}
        </span>
      </h3>
      <OrderForm ref="orderRef" :campus-id="form.campusId" />
      <div class="foot-bar">
        <el-button :disabled="saving" @click="back"><el-icon class="el-icon--left"><ArrowLeft /></el-icon>{{ t('students.messages.previous') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submit">{{ t('students.messages.submitEnrollment') }}</el-button>
      </div>
    </div>
    <!-- 完成 -->
    <div v-if="step === 2 && created" class="page-card">
      <el-result icon="success" :title="t('students.messages.enrollmentSuccessful')">
        <template #sub-title>
          <div class="done">
            <div class="acc">
              <div><span class="muted">{{ t('students.messages.studentIdPortalUsername') }}</span><b>{{ created.studentNo }}</b></div>
              <div><span class="muted">{{ t('students.messages.initialPortalPassword') }}</span><b class="pw">{{ created.initialPassword }}</b></div>
            </div>
            <el-alert type="warning" :closable="false" show-icon :title="t('students.messages.theInitialPasswordIsShownOnlyOnce')" />
            <div v-if="result" class="muted order-line">{{ t('students.messages.order', { p1: result.orderNo, p2: result.packageName }) }}</div>
          </div>
        </template>
        <template #extra>
          <el-button icon="CopyDocument" @click="copyAccount">{{ t('students.messages.copyAccountDetails') }}</el-button>
          <el-button type="primary" @click="router.push(`/students/${created.id}`)">{{ t('students.messages.viewStudentRecord') }}</el-button>
          <el-button @click="resetAll">{{ t('students.messages.enrollAnotherStudent') }}</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>

<style scoped>
.enroll { max-width: 1100px; margin: 0 auto; }
.steps-card { padding: 16px 20px; }
.tip { margin-bottom: 16px; }
.foot-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--xh-border);
  padding-top: 14px;
  margin-top: 8px;
  position: sticky;
  bottom: 0;
  background: #fff;
  z-index: 2;
}
.done { display: grid; gap: 14px; max-width: 460px; margin: 0 auto; text-align: left; }
.acc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.acc > div { background: var(--xh-primary-soft); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.acc b { font-size: 22px; letter-spacing: 1px; color: var(--xh-text); }
.acc .pw { color: var(--xh-primary); font-family: ui-monospace, Consolas, monospace; }
.order-line { text-align: center; }
@media (max-width: 767px) {
  .acc { grid-template-columns: 1fr; }
  .foot-bar { margin: 8px -14px -14px; padding: 12px 14px; }
  .foot-bar .el-button { flex: 1; }
}
</style>
