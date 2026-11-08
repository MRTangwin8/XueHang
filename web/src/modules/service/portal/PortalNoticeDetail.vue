<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fmtDateTime } from '@/utils/time'
import { portalApi, renderContent, type Notice } from '../api'
import PortalSurface from './components/PortalSurface.vue'

const { t: tr } = useI18n()
const route = useRoute()
const notice = ref<Notice | null>(null)
const loading = ref(false)
const failed = ref(false)
let sequence = 0
onBeforeUnmount(() => sequence++)
async function load() {
  const current = ++sequence
  notice.value = null
  failed.value = false
  const id = Number(route.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    failed.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await portalApi.notice(id)
    if (current === sequence)
      notice.value = data
  } catch {
    if (current === sequence)
      failed.value = true
  } finally {
    if (current === sequence)
      loading.value = false
  }
}
watch(() => route.params.id, load, { immediate: true })
</script>

<template>
  <div class="page">
    <PortalSurface>
      <div class="page-head">
        <router-link to="/portal/notices">
          <el-button icon="ArrowLeft">{{ tr('service.text.noticeList') }}</el-button>
        </router-link>
      </div>
      <article v-loading="loading" class="page-card detail">
        <template v-if="notice">
          <el-tag v-if="notice.pinned">{{ tr('service.text.pinnedNotice') }}</el-tag>
          <h1>{{ notice.title }}</h1>
          <p class="meta">
            {{ fmtDateTime(notice.publishedAt) }}
            <span v-if="notice.author">·
              {{ notice.author.name }}</span>
            <span v-if="notice.campus">·
              {{ notice.campus.name }}</span>
          </p>
          <div class="content" v-html="renderContent(notice.content)" />
        </template>
        <el-empty v-else-if="failed" :description="tr('service.text.noticeNotFoundNotAccessibleOrCouldNotBe')">
          <el-button type="primary" @click="load">{{ tr('service.text.retry') }}</el-button>
        </el-empty>
      </article>
    </PortalSurface>
  </div>
</template>

<style scoped>
.detail {
  min-height: 200px;
}
h1 {
  font-size: 23px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  margin: 12px 0;
}
.content {
  border-top: 1px solid var(--xh-border);
  margin-top: 24px;
  padding-top: 20px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  overflow-x: auto;
}
.content :deep(img), .content :deep(video) {
  max-width: 100%;
  height: auto;
}
.content :deep(pre) {
  white-space: pre-wrap;
}
</style>
