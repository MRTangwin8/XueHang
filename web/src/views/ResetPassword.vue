<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AuthShell from '@/components/AuthShell.vue'
import { api } from '@/api/http'
import { checkPassword, PASSWORD_RULE_TEXT } from '@/utils/password'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const type = computed<'staff' | 'student'>(() => (route.query.type === 'student' ? 'student' : 'staff'))
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const form = reactive({ password: '', confirm: '' })
const loading = ref(false)

async function submit() {
  const error = checkPassword(form.password)
  if (error) return ElMessage.warning(error)
  if (form.password !== form.confirm) return ElMessage.warning(t('profile.passwordMismatch'))
  if (!token.value) return ElMessage.error(t('reset.invalidLink'))
  loading.value = true
  try {
    const result = await api.post<{ ok: boolean; type: 'staff' | 'student' }>(
      '/auth/reset',
      { token: token.value, newPassword: form.password },
      { silent: true },
    )
    ElMessage.success(t('reset.success'))
    await router.replace(result.type === 'student' ? '/portal/login' : '/login')
  } catch (error) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
    ElMessage.error(message || t('reset.failed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell :title="t('reset.title')" :subtitle="PASSWORD_RULE_TEXT()">
    <el-alert v-if="!token" :title="t('reset.invalidLink')" type="error" :closable="false" show-icon />
    <el-form v-else size="large" @submit.prevent="submit">
      <el-form-item>
        <el-input
          v-model="form.password" type="password" :placeholder="t('profile.newPassword')"
          prefix-icon="Lock" show-password autocomplete="new-password"
        />
      </el-form-item>
      <el-form-item>
        <el-input
          v-model="form.confirm" type="password" :placeholder="t('profile.confirmPassword')"
          prefix-icon="Lock" show-password autocomplete="new-password"
        />
      </el-form-item>
      <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">{{ t('reset.submit') }}</el-button>
    </el-form>
  </AuthShell>
</template>
