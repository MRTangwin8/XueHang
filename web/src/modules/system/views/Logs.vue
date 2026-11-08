<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { actionLabel, entityLabel, systemApi, type LogQuery, type OpLog } from '../api'
import UserSelect from '@/components/UserSelect.vue'
import { useIsMobile } from '@/utils/format'
import { dayjs, fmtDateTime, toApi } from '@/utils/time'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const num = (v: unknown) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
const query = reactive({
  userId: num(route.query.userId) as number | null | undefined,
  entity: str(route.query.entity),
  action: str(route.query.action),
  q: str(route.query.q) ?? '',
  range: (str(route.query.from) && str(route.query.to) ? [route.query.from, route.query.to] : null) as [string, string] | null,
  page: num(route.query.page) ?? 1,
  pageSize: num(route.query.pageSize) ?? 50,
})

const userSel = computed({
  get: () => query.userId,
  set: (v: number | number[] | null | undefined) => (query.userId = typeof v === 'number' ? v : undefined),
})

const facets = ref<{ entities: string[]; actions: string[] }>({ entities: [], actions: [] })
const list = ref<OpLog[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  const urlQ: Record<string, string> = {}
  if (query.userId) urlQ.userId = String(query.userId)
  if (query.entity) urlQ.entity = query.entity
  if (query.action) urlQ.action = query.action
  if (query.q.trim()) urlQ.q = query.q.trim()
  if (query.range) [urlQ.from, urlQ.to] = query.range
  if (query.page > 1) urlQ.page = String(query.page)
  if (query.pageSize !== 50) urlQ.pageSize = String(query.pageSize)
  router.replace({ query: urlQ })

  const q: LogQuery = {
    page: query.page,
    pageSize: query.pageSize,
    userId: query.userId || undefined,
    entity: query.entity || undefined,
    action: query.action || undefined,
    q: query.q.trim() || undefined,
  }
  if (query.range) {
    q.from = toApi(query.range[0])
    q.to = toApi(dayjs(query.range[1]).add(1, 'day').format('YYYY-MM-DD'))
  }
  loading.value = true
  try {
    const r = await systemApi.logs(q)
    list.value = r.items
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function search() {
  query.page = 1
  load()
}
function reset() {
  Object.assign(query, { userId: undefined, entity: undefined, action: undefined, q: '', range: null, page: 1 })
  load()
}
watch(() => [query.userId, query.entity, query.action, query.range], search)

onMounted(async () => {
  load()
  facets.value = await systemApi.logFacets()
})

/** 详情：JSON 美化，非 JSON 原样 */
function parseDetail(d: string | null): { json: boolean; text: string; summary: string } {
  if (!d) return { json: false, text: '', summary: '' }
  try {
    const v = JSON.parse(d)
    if (v && typeof v === 'object') {
      const summary = Object.entries(v)
        .slice(0, 4)
        .map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`)
        .join('，')
      return { json: true, text: JSON.stringify(v, null, 2), summary }
    }
  } catch {
    /* 非 JSON */
  }
  return { json: false, text: d, summary: d }
}

const ACTION_TYPE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  restore: 'warning',
  login: 'info',
  lock: 'danger',
  unlock: 'warning',
}
const actionType = (a: string) => ACTION_TYPE[a] ?? 'primary'
const expanded = ref<Set<number>>(new Set())
function toggleExpand(id: number) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <UserSelect v-model="userSel" :placeholder="t('system.log.operator')" />
        <el-select v-model="query.entity" clearable filterable :placeholder="t('system.log.entityType')">
          <el-option v-for="e in facets.entities" :key="e" :value="e" :label="`${entityLabel(e)}${entityLabel(e) !== e ? `（${e}）` : ''}`" />
        </el-select>
        <el-select v-model="query.action" clearable filterable :placeholder="t('system.log.action')">
          <el-option v-for="a in facets.actions" :key="a" :value="a" :label="actionLabel(a)" />
        </el-select>
        <el-date-picker
          v-model="query.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('common.startDate')"
          :end-placeholder="t('common.endDate')"
          :range-separator="t('common.to')"
          :style="{ width: isMobile ? '100%' : '260px' }"
        />
        <el-input v-model="query.q" :placeholder="t('system.log.search')" clearable prefix-icon="Search" @keyup.enter="search" @clear="search" />
        <el-button type="primary" @click="search">{{ t('system.shared.query') }}</el-button>
        <el-button @click="reset">{{ t('common.reset') }}</el-button>
      </div>

      <div v-if="isMobile" v-loading="loading">
        <el-empty v-if="!loading && !list.length" :description="t('system.log.empty')" />
        <div v-for="l in list" :key="l.id" class="m-card">
          <div class="m-head">
            <el-tag size="small" :type="actionType(l.action)" disable-transitions>{{ actionLabel(l.action) }}</el-tag>
            <b>{{ entityLabel(l.entity) }}</b>
            <span v-if="l.entityId" class="muted">#{{ l.entityId }}</span>
            <span class="spacer" />
            <span class="muted">{{ fmtDateTime(l.createdAt) }}</span>
          </div>
          <div class="muted">{{ l.user?.name ?? t('system.log.system') }}{{ l.user ? `（${l.user.staffNo}）` : '' }} · {{ l.ip || '—' }}</div>
          <div v-if="l.detail" class="detail-line" @click="toggleExpand(l.id)">
            <pre v-if="expanded.has(l.id)" class="json">{{ parseDetail(l.detail).text }}</pre>
            <span v-else class="summary">{{ parseDetail(l.detail).summary }}</span>
          </div>
        </div>
      </div>

      <el-table v-else v-loading="loading" :data="list" row-key="id">
        <el-table-column type="expand" width="36">
          <template #default="{ row }">
            <pre v-if="row.detail" class="json">{{ parseDetail(row.detail).text }}</pre>
            <div v-else class="muted" style="padding: 8px 16px">{{ t('system.log.noDetail') }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('system.log.time')" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('system.log.operator')" width="140">
          <template #default="{ row }">
            <template v-if="row.user">{{ row.user.name }} <span class="muted">{{ row.user.staffNo }}</span></template>
            <span v-else class="muted">{{ t('system.log.system') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('system.log.action')" width="96">
          <template #default="{ row }"><el-tag size="small" :type="actionType(row.action)" disable-transitions>{{ actionLabel(row.action) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('system.log.entity')" width="150">
          <template #default="{ row }">{{ entityLabel(row.entity) }}<span v-if="row.entityId" class="muted"> #{{ row.entityId }}</span></template>
        </el-table-column>
        <el-table-column :label="t('common.detail')" min-width="260">
          <template #default="{ row }"><span class="summary">{{ parseDetail(row.detail).summary }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" />
        <template #empty><el-empty :description="t('system.log.empty')" /></template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
          :pager-count="isMobile ? 5 : 7"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.json {
  margin: 0 16px; padding: 10px 12px; background: var(--el-fill-color-light); border-radius: 8px;
  font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 360px; overflow: auto;
}
.summary {
  color: var(--xh-text-2);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;

}
.m-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
.m-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.m-head .spacer { flex: 1; }
.detail-line { cursor: pointer; }
.detail-line .json { margin: 0; }
</style>
