<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { groupSubjects, systemApi, type Subject, type SubjectForm } from '../api'
import { useDialogWidth } from '@/utils/format'

const { t } = useI18n()

const dialogWidth = useDialogWidth('480px')
const list = ref<Subject[]>([])
const categories = ref<string[]>([])
const loading = ref(false)
const showInactive = ref(true)
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    ;[list.value, categories.value] = await Promise.all([systemApi.subjects(), systemApi.subjectCategories()])
  } finally {
    loading.value = false
  }
}
onMounted(load)

const groups = computed(() => {
  const kw = keyword.value.trim()
  const filtered = list.value.filter((s) => (showInactive.value || s.active) && (!kw || s.name.includes(kw)))
  return groupSubjects(filtered, categories.value)
})
const activeCount = computed(() => list.value.filter((s) => s.active).length)

const dlg = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive<SubjectForm>({ name: '', category: '', sort: 50, active: true })

function openEdit(s?: Subject, category?: string) {
  editingId.value = s?.id ?? null
  Object.assign(
    form,
    s ? { name: s.name, category: s.category, sort: s.sort, active: s.active }
      : { name: '', category: category ?? categories.value[0] ?? '', sort: 50, active: true },
  )
  dlg.value = true
}

async function save() {
  if (!form.name.trim() || !form.category.trim()) return ElMessage.warning(t('system.subject.required'))
  saving.value = true
  try {
    if (editingId.value) await systemApi.updateSubject(editingId.value, form)
    else await systemApi.createSubject(form)
    ElMessage.success(t('common.saved'))
    dlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function disable(s: Subject) {
  await ElMessageBox.confirm(t('system.subject.disableConfirm', { name: s.name, n: s.userCount ?? 0 }), t('system.subject.disable'), { type: 'warning' })
  await systemApi.deleteSubject(s.id)
  ElMessage.success(t('system.shared.disabledDone'))
  load()
}
async function enable(s: Subject) {
  await systemApi.restoreSubject(s.id)
  ElMessage.success(t('system.shared.enabledDone'))
  load()
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="keyword" :placeholder="t('system.subject.search')" clearable prefix-icon="Search" />
        <el-switch v-model="showInactive" :active-text="t('system.subject.showDisabled')" />
        <span class="muted">{{ t('system.subject.summary', { active: activeCount, total: list.length }) }}</span>
        <span class="spacer" />
        <el-button type="primary" icon="Plus" @click="openEdit()">{{ t('system.subject.add') }}</el-button>
      </div>

      <div v-loading="loading">
        <el-empty v-if="!loading && !groups.length" :description="t('system.subject.empty')" />
        <section v-for="g in groups" :key="g.category" class="group">
          <div class="group-head">
            <h3 class="page-title" style="margin: 0">{{ g.category }}</h3>
            <span class="muted">{{ t('system.subject.count', { n: g.items.length }) }}</span>
            <span class="spacer" />
            <el-button link type="primary" icon="Plus" @click="openEdit(undefined, g.category)">{{ t('system.subject.addShort') }}</el-button>
          </div>
          <div class="chips">
            <div v-for="s in g.items" :key="s.id" class="chip" :class="{ off: !s.active }">
              <span class="name">{{ s.name }}</span>
              <span class="cnt" :title="t('system.subject.linkedStaff')">{{ t('system.shared.people', { n: s.userCount ?? 0 }) }}</span>
              <el-tag v-if="!s.active" size="small" type="info" disable-transitions>{{ t('system.shared.disabled') }}</el-tag>
              <span class="ops">
                <el-button link type="primary" size="small" @click="openEdit(s)">{{ t('common.edit') }}</el-button>
                <el-button v-if="s.active" link type="danger" size="small" @click="disable(s)">{{ t('system.shared.disabled') }}</el-button>
                <el-button v-else link type="success" size="small" @click="enable(s)">{{ t('system.shared.enabled') }}</el-button>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <el-dialog v-model="dlg" :title="editingId ? t('system.subject.edit') : t('system.subject.add')" :width="dialogWidth">
      <el-form label-width="80px" @submit.prevent="save">
        <el-form-item :label="t('system.subject.name')" required><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item :label="t('system.subject.category')" required>
          <el-select v-model="form.category" filterable allow-create default-first-option :placeholder="t('system.subject.selectCategory')" style="width: 100%">
            <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('system.fields.sort')"><el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" /></el-form-item>
        <el-form-item :label="t('common.status')">
        <el-switch v-model="form.active" :active-text="t('system.shared.enabled')" :inactive-text="t('system.shared.disabled')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.group { padding: 14px 0; border-top: 1px solid var(--xh-border); }
.group:first-of-type { border-top: none; padding-top: 4px; }
.group-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.group-head .spacer { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 6px 4px 12px; border-radius: 999px;
  background: var(--xh-primary-soft); color: var(--xh-primary);
  border: 1px solid transparent;
}
.chip .name { font-weight: 550; }
.chip .cnt { font-size: 12px; color: var(--xh-text-2); }
.chip .ops { display: inline-flex; }
.chip .ops .el-button + .el-button { margin-left: 2px; }
.chip.off { background: #f1f5f9; color: var(--xh-text-2); border-color: var(--xh-border); }
.chip.off .name { text-decoration: line-through; }
</style>
