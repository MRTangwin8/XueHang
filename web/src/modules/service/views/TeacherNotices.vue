<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教师中心 · 学校通知（教职工可见的通知；?id= 打开详情） */
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fmtDate, fmtDateTime } from '@/utils/time'
import { useDialogWidth } from '@/utils/format'
import { noticeApi, type Notice } from '../api'
import NoticeContent from '../components/NoticeContent.vue'

const { t: tr } = useI18n()

const route = useRoute()
const router = useRouter()
const q = reactive({ q: (route.query.q as string) ?? '', page: Number(route.query.page) || 1, pageSize: 20 })
const items = ref<Notice[]>([])
const total = ref(0)
const loading = ref(false)
const detail = ref<Notice | null>(null)
const dlgWidth = useDialogWidth('760px')

async function load() {
  loading.value = true
  try {
    const r = await noticeApi.list({ q: q.q || undefined, page: q.page, pageSize: q.pageSize })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function search() {
  q.page = 1
  sync()
}
function sync() {
  router.replace({ query: { ...route.query, q: q.q || undefined, page: q.page > 1 ? String(q.page) : undefined } })
  load()
}
async function open(id: number) {
  detail.value = await noticeApi.get(id)
}
function close() {
  detail.value = null
  if (route.query.id) router.replace({ query: { ...route.query, id: undefined } })
}
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)

onMounted(() => {
  load()
  if (route.query.id) open(Number(route.query.id))
})
watch(() => route.query.id, (id) => id && open(Number(id)))
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="q.q" :placeholder="tr('service.text.searchTitles')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <el-button type="primary" @click="search">{{ tr('common.search') }}</el-button>
      </div>
      <div v-loading="loading">
        <el-empty v-if="!items.length" :description="tr('service.text.noNotices')" />
        <div v-for="n in items" :key="n.id" class="notice-row" @click="open(n.id)">
          <div class="nr-main">
            <div class="nr-title">
              <el-tag v-if="n.pinned" type="danger" size="small" effect="plain">{{ tr('service.text.pinned') }}</el-tag>
              <span>{{ n.title }}</span>
            </div>
            <div class="nr-excerpt">{{ plain(n.content) }}</div>
          </div>
          <div class="nr-meta">
            <div>{{ fmtDate(n.publishedAt) }}</div>
            <div class="muted">{{ n.author?.name }}</div>
          </div>
        </div>
      </div>
      <div class="pager">
        <el-pagination
          v-model:current-page="q.page"
          :page-size="q.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="sync" />
      </div>
    </div>

    <el-dialog :model-value="!!detail" :width="dlgWidth" :title="detail?.title" @close="close">
      <template v-if="detail">
        <div class="muted" style="margin: -8px 0 14px">
          {{ fmtDateTime(detail.publishedAt) }} · {{ detail.author?.name ?? '' }}
          <template v-if="detail.campus"> · {{ detail.campus.name }}</template>
        </div>
        <NoticeContent :content="detail.content" />
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.notice-row { display: flex; gap: 16px; padding: 14px 8px; border-bottom: 1px solid var(--xh-border); cursor: pointer; border-radius: 8px; }
.notice-row:hover { background: #f7f8fc; }
.notice-row:hover .nr-title span { color: var(--xh-primary); }
.nr-main { flex: 1; min-width: 0; }
.nr-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; }
.nr-excerpt { margin-top: 6px; color: var(--xh-text-2); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nr-meta { text-align: right; font-size: 13px; flex-shrink: 0; }
@media (max-width: 767px) {
  .notice-row { flex-direction: column; gap: 6px; }
  .nr-meta { text-align: left; display: flex; gap: 8px; }
}
</style>
