<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fmtDateTime } from '@/utils/time'
import { downloadFile, useIsMobile } from '@/utils/format'
import { fileSize, portalApi, type Notice, type SharedFile } from '../../api'

const { t: tr } = useI18n()
const props = defineProps<{
  mode: 'notices' | 'files'
}>()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const query = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isSafeInteger(value) && value > 0 ? value : 1
})
const search = ref(query.value)
const loading = ref(false)
const failed = ref(false)
const total = ref(0)
const notices = ref<Pick<Notice, 'id' | 'title' | 'pinned' | 'publishedAt' | 'audience'>[]>([])
const files = ref<SharedFile[]>([])
const downloading = ref<number | null>(null)
let sequence = 0
onBeforeUnmount(() => sequence++)
async function load() {
  const request = ++sequence
  loading.value = true
  failed.value = false
  try {
    const params = {
      q: query.value || undefined,
      page: page.value,
      pageSize: 12
    }
    if (props.mode === 'notices') {
      const result = await portalApi.notices(params)
      if (request !== sequence)
        return
      notices.value = [...result.items].sort((a, b) => Number(b.pinned) - Number(a.pinned))
      total.value = result.total
    }
    else {
      const result = await portalApi.files(params)
      if (request !== sequence)
        return
      files.value = result.items
      total.value = result.total
    }
  } catch {
    if (request === sequence)
      failed.value = true
  } finally {
    if (request === sequence)
      loading.value = false
  }
}
function navigate(nextPage = 1) {
  void router.replace({
    query: {
      ...route.query,
      q: search.value.trim() || undefined,
      page: nextPage > 1 ? String(nextPage) : undefined
    }
  })
}
function applySearch() {
  if (query.value === search.value.trim() && page.value === 1)
    void load()
  else
    navigate()
}
async function download(f: SharedFile) {
  if (downloading.value !== null)
    return
  downloading.value = f.id
  try {
    await downloadFile(f.fileUrl, f.fileName)
  } catch {
    ElMessage.error(tr('service.text.downloadFailedPleaseTryAgain'))
  } finally {
    downloading.value = null
  }
}
watch(() => [query.value, page.value, props.mode], () => {
  search.value = query.value
  void load()
}, { immediate: true })
</script>

<template>
  <section class="page-card">
    <h3 class="page-title">{{ mode === 'notices' ? tr('service.text.notices') : tr('service.text.resources') }}</h3>
    <form class="toolbar" @submit.prevent="applySearch">
      <el-input
        v-model="search"
        :aria-label="mode === 'notices' ? tr('service.text.searchNoticeTitles') : tr('service.text.searchResourceTitles')"
        :placeholder="mode === 'notices' ? tr('service.text.searchNoticeTitles') : tr('service.text.searchResourceTitles')"
        size="large"
        clearable
        @clear="applySearch"
      />
      <el-button type="primary" native-type="submit" size="large">{{ tr('common.search') }}</el-button>
    </form>
    <el-alert v-if="failed" :title="tr('service.text.couldNotLoadTheListPleaseTryAgain')" type="error" :closable="false">
      <el-button link @click="load">{{ tr('service.text.retry') }}</el-button>
    </el-alert>
    <div v-loading="loading" class="results">
      <template v-if="mode === 'notices'">
        <router-link v-for="n in notices" :key="n.id" :to="`/portal/notices/${n.id}`" class="list-link">
          <div>
            <el-tag v-if="n.pinned" size="small">{{ tr('service.text.pinned') }}</el-tag>
            {{ n.title }}
          </div>
          <div class="meta">{{ fmtDateTime(n.publishedAt) }}</div>
        </router-link>
      </template>
      <div v-else class="card-grid">
        <article v-for="f in files" :key="f.id" class="item-card">
          <h4>{{ f.title }}</h4>
          <p v-if="f.description" class="preserve meta">{{ f.description }}</p>
          <p class="meta">
            {{ f.fileName }}
            <br>
            {{ fileSize(f.fileSize) }}
            ·
            {{ fmtDateTime(f.createdAt) }}
          </p>
          <el-button
            type="primary"
            plain
            icon="Download"
            class="submit-button"
            :loading="downloading === f.id"
            :disabled="downloading !== null"
            @click="download(f)"
          >
            {{ tr('service.text.downloadResource') }}
          </el-button>
        </article>
      </div>
      <el-empty
        v-if="!loading && !failed && !(mode === 'notices' ? notices.length : files.length)"
        :description="query ? tr('service.text.noMatchingResults')
          : mode === 'notices' ? tr('service.text.noNotices') : tr('service.text.noResourcesAvailable')"
      />
    </div>
    <div v-if="total > 12" class="pager">
      <el-pagination
        :current-page="page"
        :page-size="12"
        :total="total"
        :pager-count="mobile ? 5 : 7"
        :layout="mobile ? 'prev, pager, next' : 'total, prev, pager, next'"
        @current-change="navigate"
      />
    </div>
  </section>
</template>

<style scoped>
.results {
  min-height: 100px;
}
</style>
