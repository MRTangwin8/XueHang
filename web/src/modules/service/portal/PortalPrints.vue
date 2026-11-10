<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FileUpload, { type UploadedFile } from '@/components/FileUpload.vue'
import DictTag from '@/components/DictTag.vue'
import { fmtDateTime } from '@/utils/time'
import { money, printMoney } from '@/utils/format'
import { portalApi, printGuide, type PrintQuote, type PrintReq } from '../api'
import PortalSurface from './components/PortalSurface.vue'

const { t: tr } = useI18n()
const guide = computed(() => printGuide())
const form = reactive({
  fileUrl: '',
  fileName: '',
  colorMode: 'BW' as 'BW' | 'COLOR',
  pages: undefined as number | undefined,
  copies: 1,
  note: ''
})
const items = ref<PrintReq[]>([])
const quote = ref<PrintQuote | null>(null)
const loading = ref(false)
const failed = ref(false)
const quoting = ref(false)
const saving = ref(false)
const cancelling = ref<number | null>(null)
const quoteError = ref('')
const uploadKey = ref(0)
const isImage = computed(() => /\.jpe?g$/i.test(form.fileName))
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  clearTimeout(timer)
  sequence++
})
function payload() {
  return { ...form, pages: isImage.value ? 1 : form.pages }
}
function uploaded(f: UploadedFile) {
  form.pages = undefined
  form.fileUrl = f.url
  form.fileName = f.name
}
async function load() {
  loading.value = true
  failed.value = false
  try {
    items.value = await portalApi.prints()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
function scheduleQuote() {
  clearTimeout(timer)
  const current = ++sequence
  quote.value = null
  quoteError.value = ''
  quoting.value = !!form.fileUrl
  if (!form.fileUrl)
    return
  timer = setTimeout(async () => {
    try {
      const result = await portalApi.quotePrint(payload())
      if (current === sequence)
        quote.value = result
    } catch (error: unknown) {
      if (current === sequence) {
        const e = error as {
          response?: {
            data?: {
              message?: string
            }
          }
        }
        quoteError.value = e.response?.data?.message || tr('service.text.couldNotCalculateThePricePleaseTryAgain')
      }
    } finally {
      if (current === sequence)
        quoting.value = false
    }
  }, 300)
}
watch(() => [
  form.fileUrl,
  form.fileName,
  form.colorMode,
  form.pages,
  form.copies
], scheduleQuote)
async function submit() {
  if (saving.value || quoting.value || !quote.value)
    return
  saving.value = true
  try {
    const result = await portalApi.submitPrint(payload())
    ElMessage.success(tr('service.text.requestSubmittedFeeCollectAfter', { v0: printMoney(result.fee), v1: fmtDateTime(result.readyAt) }))
    Object.assign(form, {
      fileUrl: '',
      fileName: '',
      colorMode: 'BW',
      pages: undefined,
      copies: 1,
      note: ''
    })
    uploadKey.value++
    quote.value = null
    await load()
  } catch {
  } finally {
    saving.value = false
  }
}
async function cancel(p: PrintReq) {
  if (cancelling.value !== null)
    return
  cancelling.value = p.id
  try {
    try {
      await ElMessageBox.confirm(tr('service.text.cancelThisPrintRequest'), tr('service.text.cancelPrintRequest'), { type: 'warning' })
    } catch {
      return
    }
    await portalApi.cancelPrint(p.id)
    ElMessage.success(tr('service.text.printRequestCancelled'))
    await load()
  } catch {
    await load()
  } finally {
    cancelling.value = null
  }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PortalSurface>
      <section class="page-card guide">
        <h3 class="page-title">{{ tr('service.text.printingInstructions') }}</h3>
        <p v-for="g in guide" :key="g.label">
          <strong v-if="g.label">{{ g.label }}：</strong>
          {{ g.text }}
        </p>
      </section>
      <section class="page-card">
        <h3 class="page-title">{{ tr('service.text.submitPrintRequest') }}</h3>
        <el-form label-position="top" size="large" @submit.prevent="submit">
          <el-form-item :label="tr('service.text.fileToPrint')" required>
            <FileUpload :key="uploadKey" kind="print" :tip="tr('service.text.pdfAndJpgOnly')" @uploaded="uploaded" />
          </el-form-item>
          <el-form-item :label="tr('service.text.printMode')" required>
            <el-radio-group v-model="form.colorMode" :disabled="saving">
              <el-radio-button value="BW">{{ tr('service.text.blackAndWhite') }}</el-radio-button>
              <el-radio-button value="COLOR">{{ tr('service.text.color') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="tr('service.text.pages')">
            <div>
              <el-input-number
                v-model="form.pages"
                :min="1"
                :max="2000"
                :precision="0"
                :disabled="isImage || saving"
                :placeholder="tr('service.text.autoDetectPdfPages')"
              />
              <p class="meta">{{ isImage ? tr('service.text.jpgCountsAs1Page') : tr('service.text.pdfPagesAreDetectedAutomaticallyWhenPossibleEnterThe') }}</p>
            </div>
          </el-form-item>
          <el-form-item :label="tr('service.text.copies')" required>
            <el-input-number v-model="form.copies" :min="1" :max="100" :precision="0" :disabled="saving" />
          </el-form-item>
          <el-form-item :label="tr('common.remark')">
            <el-input v-model="form.note" type="textarea" :rows="3" />
          </el-form-item>
          <div v-if="form.fileUrl" v-loading="quoting" class="quote">
            <template v-if="quote">
              <div class="row">
                <span>{{ tr('service.text.estimatedFee') }}</span>
                <strong class="fee">{{ printMoney(quote.fee) }}</strong>
              </div>
              <p>{{ tr('service.text.pagesCopiesPage', { pages: quote.pages, copies: form.copies, price: money(quote.unitPrice) }) }}</p>
              <p class="meta">
                {{ tr('service.text.pageCountSource') }}
                {{ isImage ? tr('service.text.jpgFixedAt1Page')
                  : quote.detected ? tr('service.text.autoDetected') : tr('service.text.enteredManuallyNotAutoDetected') }}
              </p>
              <p>{{ tr('service.text.availableForCollectionAfter', { time: fmtDateTime(quote.readyAt) }) }}</p>
              <p class="meta">{{ tr('service.text.finalFeesAndCollectionTimeAreConfirmedUponSubmission') }}</p>
            </template>
            <p v-else-if="quoting">{{ tr('service.text.calculatingPrice') }}</p>
            <template v-else>
              <p class="text-danger" role="alert">{{ quoteError }}</p>
              <el-button link @click="scheduleQuote">{{ tr('service.text.recalculatePrice') }}</el-button>
            </template>
          </div>
          <el-button class="submit-button" type="primary" native-type="submit" :loading="saving" :disabled="!quote || quoting">
            {{ tr('service.text.submitPrintRequest') }}
          </el-button>
        </el-form>
      </section>
      <section v-loading="loading" class="page-card">
        <div class="section-head">
          <h3 class="page-title">{{ tr('service.text.myPrintHistory') }}</h3>
          <el-button link @click="load">{{ tr('common.refresh') }}</el-button>
        </div>
        <el-alert v-if="failed" :title="tr('service.text.couldNotLoadPrintHistoryRefreshToTryAgain')" type="error" :closable="false" />
        <div class="card-grid">
          <article v-for="p in items" :key="p.id" class="item-card">
            <div class="row">
              <h4>{{ p.fileName }}</h4>
              <DictTag dict="printStatuses" :value="p.status" />
            </div>
            <p>
              {{ p.colorMode === 'BW' ? tr('service.text.blackAndWhite') : tr('service.text.color') }}
              ·
              {{ tr('service.text.pagesCopies2', { pages: p.pages, copies: p.copies }) }}
            </p>
            <p class="accent">{{ tr('service.text.fee') }}
              {{ printMoney(p.fee) }}</p>
            <p>{{ tr('service.text.collectionAfter', { time: fmtDateTime(p.readyAt) }) }}</p>
            <p class="meta">{{ tr('service.text.submittedAt') }}
              {{ fmtDateTime(p.submittedAt) }}</p>
            <p v-if="p.note" class="meta preserve">{{ tr('service.text.notes') }}
              {{ p.note }}</p>
            <el-button v-if="p.status === 'PENDING'" :loading="cancelling === p.id" :disabled="cancelling !== null" @click="cancel(p)">
              {{ tr('service.text.cancelRequest') }}
            </el-button>
          </article>
        </div>
        <el-empty v-if="!loading && !failed && !items.length" :description="tr('service.text.noPrintRequests')" />
      </section>
    </PortalSurface>
  </div>
</template>

<style scoped>
.guide {
  background: var(--xh-primary-soft);
}
.guide p {
  line-height: 1.9;
}
.quote {
  padding: 16px;
  background: var(--xh-bg);
  border-radius: 10px;
  margin-bottom: 18px;
  min-height: 90px;
}
.quote p {
  line-height: 1.8;
}
.fee {
  color: var(--xh-primary);
  font-size: 26px;
}
</style>
