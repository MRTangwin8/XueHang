<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AxiosError } from 'axios'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import { mailApi, type MailSettings } from '../api'

const { t } = useI18n()
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testTo = ref('')
const testResult = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const password = ref('')
const clearPassword = ref(false)
const settings = reactive<MailSettings>({
  enabled: false, host: '', port: 465, secure: true, user: '', hasPassword: false,
  fromName: '', fromAddress: '', notifyByEmail: false, siteUrl: '',
})
const siteUrl = computed({ get: () => settings.siteUrl, set: (value: string) => { settings.siteUrl = value } })
const notifyByEmail = computed({ get: () => settings.notifyByEmail, set: (value: boolean) => { settings.notifyByEmail = value } })

const providers = [
  { key: 'gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  { key: 'outlook', host: 'smtp.office365.com', port: 587, secure: false },
  { key: 'qq', host: 'smtp.qq.com', port: 465, secure: true },
  { key: '163', host: 'smtp.163.com', port: 465, secure: true },
  { key: 'yahooJapan', host: 'smtp.mail.yahoo.co.jp', port: 465, secure: true },
] as const

async function load() {
  loading.value = true
  try {
    Object.assign(settings, await mailApi.get())
  } finally {
    loading.value = false
  }
}

function selectSecurity(value: string | number | boolean | undefined) {
  if (typeof value !== 'boolean') return
  const wasSecure = settings.secure
  settings.secure = value
  if (wasSecure && !value && settings.port === 465) settings.port = 587
  if (!wasSecure && value && (settings.port === 587 || settings.port === 25)) settings.port = 465
}

function useProvider(provider: (typeof providers)[number]) {
  Object.assign(settings, { host: provider.host, port: provider.port, secure: provider.secure })
}

async function save() {
  saving.value = true
  try {
    const payload = { ...settings, password: clearPassword.value ? '' : password.value || undefined }
    delete (payload as Partial<MailSettings>).hasPassword
    Object.assign(settings, await mailApi.save(payload))
    password.value = ''
    clearPassword.value = false
    ElMessage.success(t('system.mail.saved'))
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testResult.value = null
  testing.value = true
  try {
    await mailApi.test(testTo.value)
    testResult.value = { type: 'success', text: t('system.mail.testSuccess') }
  } catch (error) {
    const message = (error as AxiosError<ApiError>).response?.data?.message || (error as Error).message
    testResult.value = { type: 'error', text: message }
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page mail-page">
    <div class="page-card">
      <el-form label-position="top">
        <h3 class="page-title">{{ t('system.mail.basic') }}</h3>
        <el-form-item :label="t('system.mail.enabled')"><el-switch v-model="settings.enabled" /></el-form-item>
        <el-form-item :label="t('system.mail.provider')">
          <div class="providers">
            <el-button v-for="provider in providers" :key="provider.key" plain @click="useProvider(provider)">
              {{ t(`system.mail.providers.${provider.key}`) }}
            </el-button>
            <el-button plain @click="Object.assign(settings, { host: '', port: 465, secure: true })">{{ t('system.mail.providers.custom') }}</el-button>
          </div>
          <div class="form-hint">{{ t('system.mail.authHint') }}</div>
        </el-form-item>
        <div class="field-grid">
          <el-form-item :label="t('system.mail.host')"><el-input v-model="settings.host" maxlength="200" /></el-form-item>
          <el-form-item :label="t('system.mail.port')"><el-input-number v-model="settings.port" :min="1" :max="65535" /></el-form-item>
        </div>
        <el-form-item :label="t('system.mail.security')">
          <el-radio-group :model-value="settings.secure" @change="selectSecurity">
            <el-radio-button :value="true">{{ t('system.mail.ssl') }}</el-radio-button>
            <el-radio-button :value="false">{{ t('system.mail.starttls') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <div class="field-grid">
          <el-form-item :label="t('system.mail.user')"><el-input v-model="settings.user" maxlength="200" /></el-form-item>
          <el-form-item :label="t('system.mail.password')">
            <el-input v-model="password" type="password" show-password maxlength="500"
              :disabled="clearPassword" :placeholder="settings.hasPassword ? t('system.mail.passwordSet') : ''" />
            <el-checkbox v-if="settings.hasPassword" v-model="clearPassword">{{ t('system.mail.clearPassword') }}</el-checkbox>
          </el-form-item>
        </div>

        <h3 class="page-title">{{ t('system.mail.sender') }}</h3>
        <div class="field-grid">
          <el-form-item :label="t('system.mail.fromName')"><el-input v-model="settings.fromName" maxlength="100" /></el-form-item>
          <el-form-item :label="t('system.mail.fromAddress')"><el-input v-model="settings.fromAddress" maxlength="200" /></el-form-item>
        </div>
        <el-form-item :label="t('system.mail.siteUrl')">
          <el-input v-model="siteUrl" maxlength="300" placeholder="https://crm.example.com" />
          <div class="form-hint">{{ t('system.mail.siteUrlHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('system.mail.notifyByEmail')">
          <el-switch v-model="notifyByEmail" />
          <div class="form-hint">{{ t('system.mail.notifyHint') }}</div>
        </el-form-item>

        <h3 class="page-title">{{ t('system.mail.testTitle') }}</h3>
        <div class="test-row">
          <el-input v-model="testTo" :placeholder="t('system.mail.testTo')" @keyup.enter="sendTest" />
          <el-button :loading="testing" :disabled="!testTo" @click="sendTest">{{ t('system.mail.sendTest') }}</el-button>
        </div>
        <el-alert v-if="testResult" :title="testResult.text" :type="testResult.type" :closable="false" show-icon />
        <div class="actions"><el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button></div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.mail-page { max-width: 960px; }
.page-title:not(:first-child) { margin-top: 24px; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.providers { display: flex; flex-wrap: wrap; gap: 8px; }
.providers .el-button { margin-left: 0; }
.form-hint { width: 100%; margin-top: 6px; color: var(--xh-text-2); font-size: 12px; line-height: 1.6; }
.test-row { display: flex; gap: 10px; margin-bottom: 12px; max-width: 620px; }
.actions { display: flex; justify-content: flex-end; padding-top: 18px; border-top: 1px solid var(--xh-border); }
@media (max-width: 650px) {
  .field-grid { grid-template-columns: 1fr; }
  .test-row { align-items: stretch; flex-direction: column; }
}
</style>
