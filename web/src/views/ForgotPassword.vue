<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import AuthShell from '@/components/AuthShell.vue'
import { api } from '@/api/http'
import { useSite } from '@/stores/site'

const { t } = useI18n()
const route = useRoute()
const site = useSite()
const type = computed<'staff' | 'student'>(() => (route.query.type === 'student' ? 'student' : 'staff'))
const form = reactive({ account: '' })
const loading = ref(false)
const sent = ref(false)

async function submit() {
  if (!form.account.trim()) return
  loading.value = true
  try {
    await api.post('/auth/forgot', { type: type.value, account: form.account.trim() }, { silent: true })
    sent.value = true
  } catch (error) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
    ElMessage.error(message || t('forgot.requestFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell :portal="type === 'student'" :title="t('forgot.title')" :subtitle="site.text(type === 'student' ? 'portalLoginSubtitle' : 'loginSubtitle')">
    <el-result v-if="sent" icon="success" :title="t('forgot.sent')">
      <template #extra>
        <router-link :to="type === 'student' ? '/portal/login' : '/login'">{{ t('forgot.backToLogin') }}</router-link>
      </template>
    </el-result>
    <el-form v-else size="large" @submit.prevent="submit">
      <el-form-item>
        <el-input v-model="form.account" :placeholder="t(type === 'student' ? 'auth.studentNo' : 'auth.staffNo')" prefix-icon="User" autocomplete="username" />
      </el-form-item>
      <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">{{ t('forgot.send') }}</el-button>
      <div class="back"><router-link :to="type === 'student' ? '/portal/login' : '/login'">{{ t('forgot.backToLogin') }}</router-link></div>
    </el-form>
  </AuthShell>
</template>

<style scoped>
.back { margin-top: 20px; text-align: center; font-size: 13px; }
.back a, :deep(.el-result__extra a) { color: var(--xh-primary); text-decoration: none; font-weight: 500; }
:deep(.el-result) { padding: 12px 0; }
</style>
