<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { checkPassword, PASSWORD_RULE_TEXT } from '@/utils/password'

const { t } = useI18n()

const auth = useAuth()
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const saving = ref(false)

async function submit() {
  const err = checkPassword(form.newPassword)
  if (err) return ElMessage.warning(err)
  if (form.newPassword !== form.confirm) return ElMessage.warning(t('profile.passwordMismatch'))
  saving.value = true
  try {
    await auth.changePassword(form.oldPassword, form.newPassword)
    ElMessage.success(t('profile.passwordChanged'))
    Object.assign(form, { oldPassword: '', newPassword: '', confirm: '' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-card" style="max-width: 520px">
      <h3 class="page-title">{{ t('profile.title') }}</h3>
      <el-descriptions :column="1" border style="margin-bottom: 16px">
        <el-descriptions-item :label="t('profile.name')">{{ auth.me?.name }}</el-descriptions-item>
        <el-descriptions-item :label="t('profile.staffNo')">{{ auth.me?.staffNo }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.campus')">{{ auth.me?.campusName }}</el-descriptions-item>
        <el-descriptions-item :label="t('profile.roles')">{{ auth.me?.roleNames?.join('、') }}</el-descriptions-item>
      </el-descriptions>
      <h3 class="page-title">{{ t('profile.changePassword') }}</h3>
      <el-form label-width="90px" @submit.prevent="submit">
        <el-form-item :label="t('profile.oldPassword')"><el-input
          v-model="form.oldPassword"
          type="password"
          show-password
          autocomplete="current-password"
        /></el-form-item>
        <el-form-item :label="t('profile.newPassword')">
          <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
          <div class="muted">{{ PASSWORD_RULE_TEXT() }}</div>
        </el-form-item>
        <el-form-item :label="t('profile.confirmPassword')"><el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" /></el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="saving">{{ t('profile.changePassword') }}</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>
