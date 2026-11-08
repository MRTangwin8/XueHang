<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import AuthShell from '@/components/AuthShell.vue'
import { useSite } from '@/stores/site'
import { api } from '@/api/http'

const { t } = useI18n()

const site = useSite()

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const form = reactive({ staffNo: '', password: '' })
const loading = ref(false)
const forgotEnabled = ref(false)

onMounted(async () => {
  try {
    forgotEnabled.value = (await api.get<{ enabled: boolean }>('/auth/forgot/available')).enabled
  } catch {
    forgotEnabled.value = false
  }
})

async function submit() {
  if (!form.staffNo || !form.password) return
  loading.value = true
  try {
    await auth.login(form.staffNo, form.password)
    router.replace((route.query.redirect as string) || '/')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell :title="site.text('loginTitle')" :subtitle="site.text('loginSubtitle')">
    <el-form size="large" @submit.prevent="submit">
      <el-form-item><el-input v-model="form.staffNo" :placeholder="t('auth.staffNo')" prefix-icon="User" autocomplete="username" /></el-form-item>
      <el-form-item><el-input
        v-model="form.password"
        type="password"
        :placeholder="t('auth.password')"
        prefix-icon="Lock"
        show-password
        autocomplete="current-password"
      /></el-form-item>
      <div v-if="forgotEnabled" class="forgot"><router-link to="/forgot-password?type=staff">{{ t('forgot.link') }}</router-link></div>
      <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">{{ t('auth.login') }}</el-button>
    </el-form>
    <div class="switch">{{ t('auth.imStudent') }}<router-link to="/portal/login">{{ t('auth.toStudentLogin') }}</router-link></div>
  </AuthShell>
</template>

<style scoped>
.switch { margin-top: 20px; font-size: 13px; color: var(--xh-text-2); text-align: center; }
.switch a { color: var(--xh-primary); text-decoration: none; font-weight: 500; }
.forgot { margin: -8px 0 14px; text-align: right; font-size: 13px; }
.forgot a { color: var(--xh-primary); text-decoration: none; }
</style>
