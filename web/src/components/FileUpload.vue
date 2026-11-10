<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * 单文件上传 → POST /api/common/upload?kind=xxx。
 * kind: document（仅 txt）| print（PDF/JPG）| image | file | logo（站点 Logo，公开目录，需 system.site）
 * <FileUpload kind="document" @uploaded="(f) => { form.fileUrl = f.url; form.fileName = f.name }" />
 */
import { ref } from 'vue'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import { http } from '@/api/http'

const { t } = useI18n()

export interface UploadedFile { url: string; name: string; size: number }
const props = defineProps<{ kind: 'document' | 'print' | 'image' | 'file' | 'logo'; tip?: string; buttonText?: string; accept?: string }>()
const emit = defineEmits<{ uploaded: [file: UploadedFile] }>()
const current = ref<UploadedFile | null>(null)

const ACCEPT: Record<string, string> = { document: '.txt', print: '.pdf,.jpg,.jpeg', image: 'image/*', file: '', logo: '.png,.jpg,.jpeg,.webp' }

async function upload(opt: UploadRequestOptions) {
  const fd = new FormData()
  fd.append('file', opt.file)
  const r = await http.post<UploadedFile>(`/common/upload?kind=${props.kind}`, fd)
  current.value = r.data
  emit('uploaded', r.data)
  ElMessage.success(t('upload.success'))
}
</script>

<template>
  <div>
    <el-upload :show-file-list="false" :http-request="upload" :accept="accept ?? ACCEPT[kind]">
      <el-button type="primary" plain icon="Upload">{{ buttonText ?? t('upload.choose') }}</el-button>
    </el-upload>
    <div v-if="current" class="muted" style="margin-top: 4px">{{ t('upload.uploaded', { name: current.name }) }}</div>
    <div v-if="tip" class="muted" style="margin-top: 4px">{{ tip }}</div>
  </div>
</template>
