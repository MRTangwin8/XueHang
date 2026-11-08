<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemApi, type Role, type RoleForm } from '../api'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'

const { t } = useI18n()

type PermGroup = Awaited<ReturnType<typeof systemApi.permissions>>[number] & { key: string }

const auth = useAuth()
const dict = useDict()
const route = useRoute()
const router = useRouter()

const roles = ref<Role[]>([])
const permGroups = ref<PermGroup[]>([])
const loading = ref(false)
const saving = ref(false)
/** 当前编辑：角色 id，或 'new' 表示新建 */
const current = ref<number | 'new' | null>(null)
const form = reactive<RoleForm>({ name: '', description: '', dataScope: 'SELF', sort: 50, permissions: [] })
const isSuper = ref(false)
const checked = ref<Set<string>>(new Set())

const currentRole = computed(() => (typeof current.value === 'number' ? roles.value.find((r) => r.id === current.value) : undefined))
const isSystemRole = computed(() => !!currentRole.value?.isSystem)
/** 只有超级管理员可以编辑 / 创建拥有「*」的角色 */
const canTouchSuper = computed(() => (auth.me?.perms ?? []).includes('*'))
const superLocked = computed(() => (isSystemRole.value && currentRole.value?.permissions.includes('*')) || !canTouchSuper.value)

async function load(selectId?: number) {
  loading.value = true
  try {
    ;[roles.value, permGroups.value] = await Promise.all([
      systemApi.roles(),
      permGroups.value.length ? permGroups.value : systemApi.permissions() as Promise<PermGroup[]>,
    ])
  } finally {
    loading.value = false
  }
  const want = selectId ?? (Number(route.query.id) || undefined)
  const r = roles.value.find((x) => x.id === want) ?? roles.value[0]
  if (r) select(r)
}
onMounted(() => load())

function select(r: Role) {
  current.value = r.id
  Object.assign(form, { name: r.name, description: r.description ?? '', dataScope: r.dataScope, sort: r.sort })
  isSuper.value = r.permissions.includes('*')
  checked.value = new Set(r.permissions.filter((c) => c !== '*'))
  router.replace({ query: { id: String(r.id) } })
}

function createNew() {
  current.value = 'new'
  Object.assign(form, { name: '', description: '', dataScope: 'SELF', sort: 50 })
  isSuper.value = false
  checked.value = new Set()
  router.replace({ query: {} })
}

function toggle(code: string, on: boolean) {
  const s = new Set(checked.value)
  if (on) s.add(code)
  else s.delete(code)
  checked.value = s
}
function groupState(g: PermGroup) {
  const n = g.items.filter((i) => checked.value.has(i.code)).length
  return { all: n === g.items.length, some: n > 0 && n < g.items.length, n }
}
function toggleGroup(g: PermGroup, on: boolean) {
  const s = new Set(checked.value)
  g.items.forEach((i) => (on ? s.add(i.code) : s.delete(i.code)))
  checked.value = s
}
const total = computed(() => permGroups.value.reduce((n, g) => n + g.items.length, 0))

async function save() {
  if (!form.name.trim()) return ElMessage.warning(t('system.role.required'))
  const body: RoleForm = { ...form, permissions: isSuper.value ? ['*'] : [...checked.value] }
  saving.value = true
  try {
    let id: number
    if (current.value === 'new') id = (await systemApi.createRole(body)).id
    else id = (await systemApi.updateRole(current.value as number, body)).id
    ElMessage.success(t('system.role.saved'))
    await load(id)
    if (auth.me) auth.fetchMe()
  } finally {
    saving.value = false
  }
}

async function remove() {
  const r = currentRole.value
  if (!r) return
  await ElMessageBox.confirm(t('system.role.deleteConfirm', { name: r.name }), t('system.role.delete'), { type: 'warning' })
  await systemApi.deleteRole(r.id)
  ElMessage.success(t('common.deleted'))
  router.replace({ query: {} })
  load()
}

const scopeLabel = (v: string) => dict.label('dataScopes', v)
const permGroupLabel = (g: PermGroup) => {
  const key = `system.permGroups.${g.key}`
  return t(key, g.group)
}
const permLabel = (code: string, name: string) => {
  const key = `system.perms.${code}`
  return t(key, name)
}
</script>

<template>
  <div class="page">
    <div class="roles-layout">
      <div class="page-card role-list" v-loading="loading">
        <div class="list-head">
          <h3 class="page-title" style="margin: 0">{{ t('system.fields.roles') }}</h3>
          <span class="spacer" />
          <el-button type="primary" size="small" icon="Plus" @click="createNew">{{ t('common.create') }}</el-button>
        </div>
        <div
          v-for="r in roles"
          :key="r.id"
          class="role-item"
          :class="{ active: current === r.id }"
          @click="select(r)"
        >
          <div class="ri-top">
            <span class="ri-name">{{ r.name }}</span>
            <el-tag v-if="r.isSystem" size="small" type="warning" disable-transitions>{{ t('system.role.builtIn') }}</el-tag>
            <span class="spacer" />
            <span class="muted">{{ t('system.shared.peopleSpaced', { n: r.userCount }) }}</span>
          </div>
          <div class="muted">
            {{ r.permissions.includes('*') ? t('system.role.all') : t('system.role.count', { n: r.permissions.length }) }} · {{ scopeLabel(r.dataScope) }}
          </div>
        </div>
        <div v-if="current === 'new'" class="role-item active">
          <div class="ri-top"><span class="ri-name">{{ form.name || t('system.role.new') }}</span></div>
          <div class="muted">{{ t('system.role.unsaved') }}</div>
        </div>
      </div>

      <div class="page-card role-edit">
        <template v-if="current !== null">
          <div class="list-head">
            <h3 class="page-title" style="margin: 0">{{ current === 'new' ? t('system.role.create') : t('system.role.edit') }}</h3>
            <span class="spacer" />
            <el-button v-if="currentRole && !currentRole.isSystem" type="danger" plain size="small" icon="Delete" @click="remove">{{
              t('common.delete')
            }}</el-button>
            <el-button type="primary" size="small" :loading="saving" icon="Check" @click="save">{{ t('common.save') }}</el-button>
          </div>

          <el-form label-width="90px" class="role-form">
            <el-form-item :label="t('system.fields.roleName')" required>
              <el-input v-model="form.name" maxlength="30" :disabled="isSystemRole" />
              <div v-if="isSystemRole" class="muted">{{ t('system.role.systemHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('system.fields.description')"><el-input v-model="form.description" maxlength="200" /></el-form-item>
            <el-form-item :label="t('system.fields.scope')">
              <el-radio-group v-model="form.dataScope">
                <el-radio v-for="o in dict.options('dataScopes')" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
              </el-radio-group>
              <div class="muted" style="width: 100%">{{ t('system.role.scopeHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('system.fields.sort')">
              <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('system.fields.superAdmin')">
              <el-switch v-model="isSuper" :disabled="superLocked" :active-text="t('system.role.superSwitch')" />
              <div v-if="!canTouchSuper" class="muted" style="width: 100%">{{ t('system.role.superHint') }}</div>
            </el-form-item>
          </el-form>

          <div class="perm-head">
            <b>{{ t('system.role.permissions') }}</b>
            <span class="muted">{{ isSuper ? t('system.role.hasAll') : t('system.role.selected', { n: checked.size, total }) }}</span>
          </div>
          <div class="perm-groups" :class="{ disabled: isSuper }">
            <div v-for="g in permGroups" :key="g.group" class="perm-group">
              <div class="pg-head">
                <el-checkbox
                  :model-value="isSuper || groupState(g).all"
                  :indeterminate="!isSuper && groupState(g).some"
                  :disabled="isSuper"
                  @change="(v: unknown) => toggleGroup(g, !!v)"
                >
                  <b>{{ permGroupLabel(g) }}</b>
                </el-checkbox>
                <span class="muted">{{ isSuper ? g.items.length : groupState(g).n }}/{{ g.items.length }}</span>
              </div>
              <div class="pg-items">
                <el-checkbox
                  v-for="i in g.items"
                  :key="i.code"
                  :model-value="isSuper || checked.has(i.code)"
                  :disabled="isSuper"
                  @change="(v: unknown) => toggle(i.code, !!v)"
                >
                  {{ permLabel(i.code, i.name) }}
                </el-checkbox>
              </div>
            </div>
          </div>
        </template>
        <el-empty v-else :description="t('system.role.select')" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.roles-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
.role-list { padding: 14px; }
.list-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.list-head .spacer, .ri-top .spacer { flex: 1; }
.role-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; margin-bottom: 4px; }
.role-item:hover { background: var(--el-fill-color-light); }
.role-item.active { background: var(--xh-primary-soft); border-color: var(--el-color-primary-light-7); }
.ri-top { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.ri-name { font-weight: 600; }
.role-item.active .ri-name { color: var(--xh-primary); }
.role-form { max-width: 640px; }
.perm-head { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; }
.perm-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.perm-group { border: 1px solid var(--xh-border); border-radius: 10px; padding: 10px 12px; }
.pg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px dashed var(--xh-border);
  padding-bottom: 6px;
  margin-bottom: 6px;

}
.pg-items { display: flex; flex-direction: column; }
.pg-items .el-checkbox { margin-right: 0; height: 28px; }
.perm-groups.disabled { opacity: 0.75; }
@media (max-width: 767px) {
  .roles-layout { grid-template-columns: 1fr; gap: 0; }
  .perm-groups { grid-template-columns: 1fr; }
}
</style>
