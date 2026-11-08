<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { localName } from '@/utils/edu'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import BrandLogo from '@/components/BrandLogo.vue'
import LangSwitcher from '@/components/LangSwitcher.vue'
import { http } from '@/api/http'
import { checkPassword, PASSWORD_RULE_TEXT } from '@/utils/password'

type DbType = 'sqlite' | 'mysql' | 'postgresql'
type RunState = 'idle' | 'running' | 'done' | 'failed'
interface EnvironmentCheck {
  node: string
  nodeOk: boolean
  serverWritable: boolean
  prismaWritable: boolean
  platform: string
}
interface RunStatus {
  state: RunState
  log: string
  error?: string
}

const { t } = useI18n()
const step = ref(0)
const token = ref('')
const environment = ref<EnvironmentCheck | null>(null)
const checking = ref(false)
const tokenLoading = ref(false)
const dbTesting = ref(false)
const dbTested = ref(false)
const dbVersion = ref('')
/** 连接失败的完整原因（常驻显示，便于排查） */
const dbError = ref('')
const installing = ref(false)
const runStatus = reactive<RunStatus>({ state: 'idle', log: '' })
const logBox = ref<HTMLElement>()
let pollTimer: ReturnType<typeof setTimeout> | undefined

const db = reactive({ type: 'sqlite' as DbType, host: '127.0.0.1', port: 3306, user: '', password: '', database: '' })
const setup = reactive({
  siteName: t('install.defaults.siteName'),
  campusName: t('install.defaults.campusName'),
  campusCode: 'MAIN',
  timezone: 'Asia/Tokyo',
  staffNo: 'admin',
  adminName: t('install.defaults.adminName'),
  email: '',
  password: '',
  confirmPassword: '',
  demoData: false,
  preset: 'jp-juku',
})
/** 行业模板（考试类型、成绩模板、档案字段、下拉选项、教授课程） */
const presets = ref<{ id: string; name: string; description: string }[]>([])

const longRequest = { silent: true, timeout: 10 * 60_000 }
const environmentOk = computed(() => !!environment.value?.nodeOk && !!environment.value?.serverWritable && !!environment.value?.prismaWritable)
const databaseFieldsVisible = computed(() => db.type !== 'sqlite')
const timezones = [
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Europe/London',
  'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC',
]

function errorMessage(error: unknown) {
  return (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ||
    (error as { message?: string }).message || t('install.requestFailed')
}

async function loadEnvironment() {
  checking.value = true
  http.get<{ id: string; name: string; description: string }[]>('/install/presets', longRequest).then((r) => (presets.value = r.data)).catch(() => undefined)
  try {
    environment.value = (await http.get<EnvironmentCheck>('/install/check', longRequest)).data
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    checking.value = false
  }
}

async function verifyToken() {
  if (!token.value.trim()) return ElMessage.warning(t('install.tokenRequired'))
  if (!environmentOk.value) return ElMessage.warning(t('install.environmentBlocked'))
  tokenLoading.value = true
  try {
    await http.post('/install/verify-token', { token: token.value.trim() }, longRequest)
    step.value = 1
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    tokenLoading.value = false
  }
}

function dbPayload() {
  return {
    type: db.type,
    host: db.host.trim(),
    port: db.port,
    user: db.user.trim(),
    password: db.password,
    database: db.database.trim(),
  }
}

async function testDatabase() {
  if (databaseFieldsVisible.value && (!db.host.trim() || !db.database.trim())) return ElMessage.warning(t('install.dbRequired'))
  dbTesting.value = true
  dbTested.value = false
  dbError.value = ''
  try {
    const result = (await http.post<{ ok: boolean; version: string }>('/install/test-db', { token: token.value.trim(), db: dbPayload() }, longRequest)).data
    dbTested.value = result.ok
    dbVersion.value = result.version
    ElMessage.success(t('install.dbConnected'))
  } catch (error) {
    dbError.value = errorMessage(error)
    ElMessage.error(dbError.value)
  } finally {
    dbTesting.value = false
  }
}

function nextFromDatabase() {
  if (!dbTested.value) return ElMessage.warning(t('install.testFirst'))
  step.value = 2
}

function nextFromSite() {
  if (!setup.siteName.trim() || !setup.campusName.trim() || !setup.campusCode.trim() || !setup.timezone) {
    return ElMessage.warning(t('install.requiredFields'))
  }
  step.value = 3
}

async function startInstall() {
  if (!setup.staffNo.trim() || !setup.adminName.trim()) return ElMessage.warning(t('install.requiredFields'))
  const passwordError = checkPassword(setup.password)
  if (passwordError) return ElMessage.warning(passwordError)
  if (setup.password !== setup.confirmPassword) return ElMessage.warning(t('profile.passwordMismatch'))
  installing.value = true
  try {
    await http.post('/install/run', {
      token: token.value.trim(),
      db: dbPayload(),
      siteName: setup.siteName.trim(),
      campus: { name: setup.campusName.trim(), code: setup.campusCode.trim(), timezone: setup.timezone },
      admin: { staffNo: setup.staffNo.trim(), name: setup.adminName.trim(), password: setup.password, email: setup.email.trim() },
      demoData: setup.demoData,
      preset: setup.preset,
    }, longRequest)
    step.value = 4
    runStatus.state = 'running'
    pollStatus()
  } catch (error) {
    installing.value = false
    ElMessage.error(errorMessage(error))
  }
}

async function installedAfterSwitch() {
  try {
    return (await http.get<{ installed: boolean }>('/install/status', longRequest)).data.installed
  } catch {
    return false
  }
}

async function pollStatus() {
  try {
    const result = (await http.get<RunStatus>('/install/run/status', longRequest)).data
    Object.assign(runStatus, result)
    installing.value = result.state === 'running'
    if (result.state === 'running') pollTimer = setTimeout(pollStatus, 1000)
  } catch {
    if (await installedAfterSwitch()) {
      runStatus.state = 'done'
      installing.value = false
    } else {
      pollTimer = setTimeout(pollStatus, 1500)
    }
  }
}

function goLogin() {
  window.location.assign('/login')
}

watch(() => db.type, (type) => {
  db.port = type === 'postgresql' ? 5432 : 3306
  dbTested.value = false
  dbVersion.value = ''
})
watch(() => runStatus.log, async () => {
  await nextTick()
  if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
})
onMounted(loadEnvironment)
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div class="install-page">
    <header class="install-head">
      <BrandLogo :size="38" />
      <LangSwitcher />
    </header>
    <main class="install-card">
      <h1>{{ t('install.title') }}</h1>
      <p class="lead">{{ t('install.subtitle') }}</p>
      <el-steps :active="step" finish-status="success" align-center class="steps">
        <el-step :title="t('install.steps.welcome')" />
        <el-step :title="t('install.steps.database')" />
        <el-step :title="t('install.steps.site')" />
        <el-step :title="t('install.steps.admin')" />
        <el-step :title="t('install.steps.running')" />
      </el-steps>

      <section v-if="step === 0" class="step-body">
        <h2>{{ t('install.welcomeTitle') }}</h2>
        <p class="hint">{{ t('install.tokenHelp') }}</p>
        <el-form label-position="top">
          <el-form-item :label="t('install.token')"><el-input v-model="token" show-password autocomplete="off" /></el-form-item>
        </el-form>
        <div class="check-head">
          <h3>{{ t('install.environment') }}</h3>
          <el-button :loading="checking" @click="loadEnvironment">{{ t('common.refresh') }}</el-button>
        </div>
        <div v-if="environment" class="check-list">
          <div>
            <span>{{ t('install.nodeVersion') }} · {{ environment.node }}</span>
            <el-tag :type="environment.nodeOk ? 'success' : 'danger'">{{ t(environment.nodeOk ? 'install.passed' : 'install.failed') }}</el-tag>
          </div>
          <div>
            <span>{{ t('install.serverWritable') }}</span>
            <el-tag :type="environment.serverWritable ? 'success' : 'danger'">
              {{ t(environment.serverWritable ? 'install.passed' : 'install.failed') }}
            </el-tag>
          </div>
          <div>
            <span>{{ t('install.prismaWritable') }}</span>
            <el-tag :type="environment.prismaWritable ? 'success' : 'danger'">
              {{ t(environment.prismaWritable ? 'install.passed' : 'install.failed') }}
            </el-tag>
          </div>
          <div><span>{{ t('install.platform') }}</span><span>{{ environment.platform }}</span></div>
        </div>
        <div class="actions"><el-button type="primary" :loading="tokenLoading" @click="verifyToken">{{ t('common.confirm') }}</el-button></div>
      </section>

      <section v-else-if="step === 1" class="step-body">
        <h2>{{ t('install.databaseTitle') }}</h2>
        <el-radio-group v-model="db.type" class="db-types">
          <el-radio-button value="sqlite">SQLite</el-radio-button>
          <el-radio-button value="mysql">MySQL / MariaDB</el-radio-button>
          <el-radio-button value="postgresql">PostgreSQL</el-radio-button>
        </el-radio-group>
        <el-alert v-if="db.type === 'sqlite'" :title="t('install.sqliteHelp')" type="info" :closable="false" show-icon />
        <el-alert v-else-if="db.type === 'mysql'" :title="t('install.mysqlDriverHelp')" type="info" :closable="false" show-icon />
        <el-form v-if="databaseFieldsVisible" label-position="top" class="db-form">
          <div class="form-grid">
            <el-form-item :label="t('install.host')"><el-input v-model="db.host" /></el-form-item>
            <el-form-item :label="t('install.port')"><el-input-number v-model="db.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
            <el-form-item :label="t('install.dbUser')"><el-input v-model="db.user" autocomplete="username" /></el-form-item>
            <el-form-item :label="t('install.dbPassword')">
              <el-input v-model="db.password" type="password" show-password autocomplete="current-password" />
            </el-form-item>
            <el-form-item :label="t('install.dbName')"><el-input v-model="db.database" /></el-form-item>
          </div>
        </el-form>
        <el-alert v-if="dbTested" :title="dbVersion" type="success" :closable="false" show-icon />
        <el-alert v-else-if="dbError" :title="dbError" type="error" :closable="false" show-icon class="db-error" />
        <div class="actions split">
          <el-button @click="step = 0">{{ t('common.back') }}</el-button><span />
          <el-button :loading="dbTesting" @click="testDatabase">{{ t('install.testConnection') }}</el-button>
          <el-button type="primary" @click="nextFromDatabase">{{ t('install.next') }}</el-button>
        </div>
      </section>

      <section v-else-if="step === 2" class="step-body">
        <h2>{{ t('install.siteTitle') }}</h2>
        <el-form label-position="top"><div class="form-grid">
          <el-form-item :label="t('install.siteName')"><el-input v-model="setup.siteName" maxlength="20" /></el-form-item>
          <el-form-item :label="t('install.campusName')"><el-input v-model="setup.campusName" maxlength="50" /></el-form-item>
          <el-form-item :label="t('install.campusCode')"><el-input v-model="setup.campusCode" maxlength="20" /></el-form-item>
          <el-form-item :label="t('install.timezone')">
            <el-select v-model="setup.timezone" filterable>
              <el-option v-for="zone in timezones" :key="zone" :label="zone" :value="zone" />
            </el-select>
          </el-form-item>
        </div></el-form>
        <template v-if="presets.length">
          <h3 class="preset-title">{{ t('install.preset') }}</h3>
          <p class="hint">{{ t('install.presetHint') }}</p>
          <el-radio-group v-model="setup.preset" class="preset-list">
            <el-radio v-for="p in presets" :key="p.id" :value="p.id" border class="preset-item">
              <b>{{ localName(p.name) }}</b>
              <span class="preset-desc">{{ localName(p.description) }}</span>
            </el-radio>
          </el-radio-group>
        </template>
        <div class="actions split">
          <el-button @click="step = 1">{{ t('common.back') }}</el-button><span />
          <el-button type="primary" @click="nextFromSite">{{ t('install.next') }}</el-button>
        </div>
      </section>

      <section v-else-if="step === 3" class="step-body">
        <h2>{{ t('install.adminTitle') }}</h2>
        <p class="hint">{{ PASSWORD_RULE_TEXT() }}</p>
        <el-form label-position="top"><div class="form-grid">
          <el-form-item :label="t('auth.staffNo')"><el-input v-model="setup.staffNo" maxlength="30" autocomplete="username" /></el-form-item>
          <el-form-item :label="t('profile.name')"><el-input v-model="setup.adminName" maxlength="50" /></el-form-item>
          <el-form-item :label="t('install.emailOptional')"><el-input v-model="setup.email" type="email" autocomplete="email" /></el-form-item>
          <el-form-item :label="t('profile.newPassword')">
            <el-input v-model="setup.password" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item :label="t('profile.confirmPassword')">
            <el-input v-model="setup.confirmPassword" type="password" show-password autocomplete="new-password" />
          </el-form-item>
        </div></el-form>
        <el-checkbox v-model="setup.demoData">{{ t('install.demoData') }}</el-checkbox>
        <div class="actions split">
          <el-button @click="step = 2">{{ t('common.back') }}</el-button><span />
          <el-button type="primary" :loading="installing" @click="startInstall">{{ t('install.start') }}</el-button>
        </div>
      </section>

      <section v-else class="step-body running-step">
        <h2>{{ t(runStatus.state === 'done' ? 'install.doneTitle' : runStatus.state === 'failed' ? 'install.failedTitle' : 'install.runningTitle') }}</h2>
        <el-progress v-if="runStatus.state === 'running'" :percentage="100" :indeterminate="true" :duration="2" />
        <pre ref="logBox" class="log">{{ runStatus.log || t('install.waitingLog') }}</pre>
        <el-alert v-if="runStatus.state === 'failed'" :title="runStatus.error || t('install.failedTitle')" type="error" :closable="false" show-icon />
        <div v-if="runStatus.state === 'done'" class="actions"><el-button type="primary" @click="goLogin">{{ t('install.goLogin') }}</el-button></div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.install-page { min-height: 100%; background: #f4f6f9; padding: 24px; }
.install-head { max-width: 960px; margin: 0 auto 18px; display: flex; align-items: center; justify-content: space-between; }
.install-card {
  max-width: 960px; margin: 0 auto; background: #fff; border: 1px solid var(--xh-border);
  border-radius: 8px; padding: 32px 40px; box-shadow: var(--xh-shadow);
}
h1 { margin: 0; font-size: 28px; }
.lead, .hint { color: var(--xh-text-2); }
.lead { margin: 8px 0 28px; }
.steps { margin-bottom: 36px; }
.step-body { max-width: 720px; margin: 0 auto; }
.preset-title { margin: 8px 0 4px !important; }
.preset-list { display: grid; gap: 10px; width: 100%; margin-bottom: 8px; }
.preset-item { height: auto !important; padding: 10px 14px !important; margin: 0 !important; align-items: flex-start; white-space: normal; }
.preset-item :deep(.el-radio__label) { display: flex; flex-direction: column; gap: 2px; line-height: 1.5; }
.preset-desc { font-size: 12px; color: var(--xh-text-2); font-weight: 400; }
.step-body h2 { font-size: 20px; margin: 0 0 18px; }
.step-body h3 { font-size: 15px; margin: 0; }
.check-head { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 10px; }
.check-list { border: 1px solid var(--xh-border); border-radius: 6px; overflow: hidden; }
.check-list > div {
  min-height: 46px; display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 8px 14px; border-bottom: 1px solid var(--xh-border);
}
.check-list > div:last-child { border-bottom: 0; }
.actions { display: flex; justify-content: flex-end; margin-top: 24px; }
.actions.split span { flex: 1; }
.db-types { margin-bottom: 18px; }
.db-form { margin-top: 18px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
.form-grid :deep(.el-select), .form-grid :deep(.el-input-number) { width: 100%; }
.log {
  min-height: 260px; max-height: 420px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  background: #111827; color: #d1fae5; border-radius: 6px; padding: 16px;
  font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace;
}
.running-step :deep(.el-progress) { margin-bottom: 18px; }
@media (max-width: 700px) {
  .install-page { padding: 14px; }
  .install-card { padding: 24px 16px; }
  .steps :deep(.el-step__title) { font-size: 11px; line-height: 1.25; }
  .form-grid { grid-template-columns: 1fr; gap: 0; }
  .db-types { display: flex; width: 100%; }
  .db-types :deep(.el-radio-button) { flex: 1; }
  .db-types :deep(.el-radio-button__inner) { width: 100%; padding: 9px 5px; font-size: 12px; }
  .actions.split { flex-wrap: wrap; gap: 8px; }
  .actions.split span { min-width: 20px; }
}
</style>
