<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教师中心 · 资料下载 */
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fmtDate } from '@/utils/time'
import { useIsMobile } from '@/utils/format'
import { fileApi, fileSize, type SharedFile } from '../api'

const { t: tr } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const q = reactive({ q: (route.query.q as string) ?? '', page: Number(route.query.page) || 1, pageSize: 20 })
const items = ref<SharedFile[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await fileApi.list({ q: q.q || undefined, page: q.page, pageSize: q.pageSize })
    items.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function sync() {
  router.replace({ query: { q: q.q || undefined, page: q.page > 1 ? String(q.page) : undefined } })
  load()
}
function search() {
  q.page = 1
  sync()
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input
          v-model="q.q"
          :placeholder="tr('service.text.searchResourceNameDescription')"
          clearable
          prefix-icon="Search"
          @keyup.enter="search"
          @clear="search" />
        <el-button type="primary" @click="search">{{ tr('common.search') }}</el-button>
      </div>
      <el-table v-if="!isMobile" v-loading="loading" :data="items">
        <el-table-column :label="tr('service.text.resourceName')" min-width="220">
          <template #default="{ row }">
            <div style="font-weight: 600">{{ row.title }}</div>
            <div class="muted">{{ row.description }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="tr('service.text.file')" prop="fileName" min-width="180" show-overflow-tooltip />
        <el-table-column :label="tr('service.text.size')" width="100"><template #default="{ row }">{{ fileSize(row.fileSize) }}</template></el-table-column>
        <el-table-column :label="tr('common.upload')" width="150">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}<div class="muted">{{ row.uploadedBy?.name }}</div></template>
        </el-table-column>
        <el-table-column :label="tr('common.operation')" width="90" fixed="right">
          <template #default="{ row }">
            <el-link type="primary" :href="row.fileUrl" :download="row.fileName" target="_blank" :underline="false">{{ tr('common.download') }}</el-link>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="tr('service.text.noResources')" /></template>
      </el-table>
      <div v-else v-loading="loading">
        <el-empty v-if="!items.length" :description="tr('service.text.noResources')" />
        <a v-for="f in items" :key="f.id" class="m-file" :href="f.fileUrl" :download="f.fileName" target="_blank">
          <el-icon :size="22" color="var(--xh-primary)"><Document /></el-icon>
          <div class="m-body">
            <div class="m-title">{{ f.title }}</div>
            <div class="muted">{{ f.fileName }} · {{ fileSize(f.fileSize) }} · {{ fmtDate(f.createdAt) }}</div>
          </div>
          <el-icon><Download /></el-icon>
        </a>
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
  </div>
</template>

<style scoped>
.m-file { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--xh-border); color: var(--xh-text); text-decoration: none; }
.m-body { flex: 1; min-width: 0; }
.m-title { font-weight: 600; }
</style>
