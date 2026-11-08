<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 在籍学员「选课缴费」：<OrderCreateDialog v-model="show" :student="{id,name,studentNo,campusId}" @created="reload" /> */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDialogWidth } from '@/utils/format'
import OrderForm from './OrderForm.vue'
import { ordersApi } from '../api'

const { t } = useI18n()

const props = defineProps<{ student: { id: number; name: string; studentNo: string; campusId?: number | null } | null }>()
const emit = defineEmits<{ created: [orderId: number] }>()
const visible = defineModel<boolean>({ default: false })
const width = useDialogWidth('860px')
const formRef = ref<InstanceType<typeof OrderForm>>()
const saving = ref(false)

async function submit() {
  if (!props.student || !formRef.value) return
  if (!(await formRef.value.validate())) return
  saving.value = true
  try {
    const o = await ordersApi.create(formRef.value.payload(props.student.id))
    ElMessage.success(t('orders.messages.orderCreated', { p1: o.orderNo }))
    visible.value = false
    emit('created', o.id)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :width="width" top="4vh" destroy-on-close :close-on-click-modal="false">
    <template #header>
      <div class="dlg-head">
        {{ t('orders.messages.courseEnrollmentPayment') }}
        <span v-if="student" class="muted">
          {{ student.name }}
          （
          {{ student.studentNo }}
          ）
        </span>
      </div>
    </template>
    <OrderForm v-if="visible && student" ref="formRef" :campus-id="student.campusId" />
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ t('orders.messages.submitOrder') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dlg-head { font-size: 16px; font-weight: 650; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
</style>
