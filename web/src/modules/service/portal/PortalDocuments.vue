<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDict } from '@/stores/dict'
import { fmtDateTime, tz } from '@/utils/time'
import { downloadFile, useDialogWidth } from '@/utils/format'
import FileUpload, { type UploadedFile } from '@/components/FileUpload.vue'
import DictTag from '@/components/DictTag.vue'
import { documentRulesTitle, documentRules, portalApi, type DocRequest } from '../api'
import PortalSurface from './components/PortalSurface.vue'

const { t: tr } = useI18n()
const dict = useDict()
const dialogWidth = useDialogWidth('640px')
const items = ref<DocRequest[]>([])
const loading = ref(false)
const failed = ref(false)
const saving = ref(false)
const now = ref(Date.now())
const uploadKey = ref(0)
const form = reactive({
  title: '',
  docType: '',
  fileUrl: '',
  fileName: '',
  note: ''
})
const editing = ref<DocRequest | null>(null)
const replacement = ref<UploadedFile | null>(null)
const editNote = ref('')
const editOpen = ref(false)
const timer = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onBeforeUnmount(() => clearInterval(timer))
const maxEdits = computed(() => dict.rules?.documentMaxEdits ?? 1)
const editHint = computed(() => tr('service.text.youMayEditOnceWithin24HoursOfSubmission', {
  hours: dict.rules?.documentEditHours ?? 24,
  times: dict.rules?.documentMaxEdits ?? 1,
}))
function canEdit(d: DocRequest) {
  return !!d.canEdit && tz(d.lockAt).valueOf() > now.value && d.editCount < maxEdits.value && d.status !== 'RETURNED'
}
function countdown(d: DocRequest) {
  const seconds = Math.max(0, Math.ceil((tz(d.lockAt).valueOf() - now.value) / 1000))
  if (!seconds)
    return tr('service.text.locked')
  return tr('service.text.locksInHMS', { v0: Math.floor(seconds / 3600), v1: Math.floor(seconds % 3600 / 60), v2: seconds % 60 })
}
async function load() {
  loading.value = true
  failed.value = false
  try {
    items.value = await portalApi.documents()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
function uploaded(f: UploadedFile) {
  form.fileUrl = f.url
  form.fileName = f.name
}
async function submit() {
  if (saving.value)
    return
  if (!form.title.trim())
    return void ElMessage.warning(tr('service.text.enterATitle'))
  if (!form.docType)
    return void ElMessage.warning(tr('service.text.selectADocumentType'))
  if (!form.fileUrl || !/\.txt$/i.test(form.fileName))
    return void ElMessage.warning(tr('service.text.uploadATxtFile'))
  saving.value = true
  try {
    await portalApi.submitDocument({ ...form, title: form.title.trim() })
    ElMessage.success(tr('service.text.requestSubmitted'))
    Object.assign(form, {
      title: '',
      docType: '',
      fileUrl: '',
      fileName: '',
      note: ''
    })
    uploadKey.value++
    await load()
  } catch {
  } finally {
    saving.value = false
  }
}
function openEdit(d: DocRequest) {
  editing.value = d
  replacement.value = null
  editNote.value = d.note ?? ''
  editOpen.value = true
}
async function saveEdit() {
  if (saving.value || !editing.value)
    return
  if (!canEdit(editing.value))
    return void ElMessage.warning(tr('service.text.thisRequestCanNoLongerBeEditedRefreshThe'))
  if (!replacement.value || !/\.txt$/i.test(replacement.value.name))
    return void ElMessage.warning(tr('service.text.uploadANewTxtFile'))
  saving.value = true
  try {
    await portalApi.editDocument(editing.value.id, {
      fileUrl: replacement.value.url,
      fileName: replacement.value.name,
      note: editNote.value
    })
    ElMessage.success(tr('service.text.changesSaved'))
    editOpen.value = false
    await load()
  } catch {
    await load()
  } finally {
    saving.value = false
  }
}
async function download(url: string, name: string) {
  try {
    await downloadFile(url, name)
  } catch {
    ElMessage.error(tr('service.text.downloadFailedPleaseTryAgain'))
  }
}
onMounted(() => {
  void dict.load().catch(() => {
  })
  void load()
})
</script>

<template>
  <div class="page">
    <PortalSurface>
      <section class="page-card rules">
        <h3 class="page-title">{{ documentRulesTitle() }}</h3>
        <p v-for="line in documentRules()" :key="line">{{ line }}</p>
      </section>
      <section class="page-card">
        <h3 class="page-title">{{ tr('service.text.requestDocumentRevision') }}</h3>
        <el-form label-position="top" size="large" @submit.prevent="submit">
          <el-form-item :label="tr('service.text.title')" required>
            <el-input v-model="form.title" maxlength="100" show-word-limit :placeholder="tr('service.text.enterTheDocumentTitle')" />
          </el-form-item>
          <el-form-item :label="tr('service.text.documentType')" required>
            <el-select v-model="form.docType" :placeholder="tr('service.text.selectType')" style="width: 100%">
              <el-option v-for="o in dict.options('docTypes')" :key="o.value" :value="o.value" :label="o.label" />
            </el-select>
          </el-form-item>
          <el-form-item :label="tr('service.text.documentFile')" required>
            <FileUpload :key="uploadKey" kind="document" :tip="tr('service.text.txtFilesOnly')" @uploaded="uploaded" />
          </el-form-item>
          <el-form-item :label="tr('common.remark')">
            <el-input v-model="form.note" type="textarea" :rows="3" :placeholder="tr('service.text.ifResubmittingExplainTheReason')" />
          </el-form-item>
          <el-button class="submit-button" type="primary" native-type="submit" :loading="saving">{{ tr('service.text.submitRequest') }}</el-button>
        </el-form>
      </section>
      <section v-loading="loading" class="page-card">
        <div class="section-head">
          <h3 class="page-title">{{ tr('service.text.myRequests') }}</h3>
          <el-button link @click="load">{{ tr('common.refresh') }}</el-button>
        </div>
        <el-alert v-if="failed" :title="tr('service.text.couldNotLoadRequestsRefreshToTryAgain')" type="error" :closable="false" />
        <div class="stack">
          <article v-for="d in items" :key="d.id" class="item-card">
            <div class="row">
              <h4>{{ d.title }}</h4>
              <DictTag dict="docStatuses" :value="d.status" />
            </div>
            <p class="meta">{{ dict.label('docTypes', d.docType) }}
              {{ tr('service.text.submittedOn') }}
              {{ fmtDateTime(d.submittedAt) }}</p>
            <p v-if="d.status !== 'RETURNED'" class="accent">{{ countdown(d) }}</p>
            <p class="meta">
              {{ tr('service.text.lockTime') }}
              {{ fmtDateTime(d.lockAt) }}
              <br>
              {{ tr('service.text.editsRemaining') }}
              {{ Math.max(0, maxEdits - d.editCount) }}
              {{ tr('service.text.edits') }}
            </p>
            <p :class="d.status !== 'RETURNED' && tz(d.dueAt).valueOf() < now ? 'text-danger' : 'meta'">
              {{ tr('service.text.expectedReturn') }}
              {{ fmtDateTime(d.dueAt) }}
            </p>
            <p v-if="d.note" class="meta preserve">{{ tr('service.text.notes') }}
              {{ d.note }}</p>
            <el-button link type="primary" @click="download(d.fileUrl, d.fileName)">{{ tr('service.text.downloadSubmittedFile') }}
              {{ d.fileName }}</el-button>
            <div>
              <el-button v-if="canEdit(d)" type="primary" plain @click="openEdit(d)">{{ tr('service.text.editUploadAgain') }}</el-button>
              <p v-else-if="d.status !== 'RETURNED'" class="meta">
                {{ tz(d.lockAt).valueOf() <= now ? tr('service.text.thisRequestIsLockedAndCannotBeChanged') : d.reason || tr('service.text.noEditsRemaining') }}
              </p>
            </div>
            <div v-if="d.status === 'RETURNED'" class="return-box">
              <p>{{ tr('service.text.returnedOn') }}
                {{ fmtDateTime(d.returnedAt) }}</p>
              <el-button
                v-if="d.returnFileUrl"
                link
                type="primary"
                @click="download(d.returnFileUrl, d.returnFileName || tr('service.text.revisedDocumentTxt'))">
                {{ tr('service.text.downloadReturnedFile') }}
                {{ d.returnFileName || tr('service.text.revisedDocument') }}
              </el-button>
              <p class="preserve">{{ tr('service.text.returnNotes') }}
                {{ d.returnNote || tr('common.none') }}</p>
            </div>
          </article>
        </div>
        <el-empty v-if="!loading && !failed && !items.length" :description="tr('service.text.noDocumentRequests')" />
      </section>
      <el-dialog
        v-model="editOpen"
        :title="tr('service.text.editDocumentRequest')"
        :width="dialogWidth"
        :close-on-click-modal="false"
        :close-on-press-escape="!saving"
        :show-close="!saving"
        destroy-on-close
      >
        <p>{{ editing?.title }}</p>
        <el-alert :title="editHint" type="warning" :closable="false" />
        <el-form label-position="top" size="large">
          <el-form-item :label="tr('service.text.uploadAReplacementTxtFile')" required>
            <FileUpload kind="document" @uploaded="f => replacement = f" />
          </el-form-item>
          <el-form-item :label="tr('common.remark')">
            <el-input v-model="editNote" type="textarea" :rows="3" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button :disabled="saving" @click="editOpen = false">{{ tr('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" :disabled="!editing || !canEdit(editing) || !replacement" @click="saveEdit">
            {{ tr('service.text.saveChanges') }}
          </el-button>
        </template>
      </el-dialog>
    </PortalSurface>
  </div>
</template>

<style scoped>
.rules {
  border: 1px solid var(--xh-primary);
  background: var(--xh-primary-soft);
}
.rules p {
  line-height: 1.9;
  margin: 8px 0;
}
.rules p:last-child {
  font-weight: 600;
}
.return-box {
  background: var(--xh-bg);
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
}
</style>
