<script setup lang="ts">
/** 通知公告正文：HTML 或纯文本（换行转 <br>） */
import { computed } from 'vue'
import { renderContent } from '../api'

const props = defineProps<{ content?: string | null }>()
const html = computed(() => renderContent(props.content))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="notice-content" v-html="html" />
</template>

<style scoped>
.notice-content { line-height: 1.85; font-size: 14px; color: var(--xh-text); word-break: break-word; }
.notice-content :deep(p) { margin: 0 0 10px; }
.notice-content :deep(img) { max-width: 100%; height: auto; border-radius: 8px; }
.notice-content :deep(a) { color: var(--xh-primary); }
.notice-content :deep(table) { border-collapse: collapse; max-width: 100%; }
.notice-content :deep(td), .notice-content :deep(th) { border: 1px solid var(--xh-border); padding: 4px 8px; }
</style>
