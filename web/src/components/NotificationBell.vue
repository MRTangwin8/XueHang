<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/http'
import { fmtDateTime } from '@/utils/time'

const { t } = useI18n()

interface Noti { id: number; title: string; content?: string; link?: string; readAt?: string; createdAt: string }
const router = useRouter()
const items = ref<Noti[]>([])
const unread = ref(0)
let timer: number | undefined

async function load() {
  try {
    const r = await api.get<{ items: Noti[]; unread: number }>('/common/notifications')
    items.value = r.items
    unread.value = r.unread
  } catch {
    /* ignore */
  }
}
async function open(n: Noti) {
  if (!n.readAt) await api.post(`/common/notifications/${n.id}/read`)
  if (n.link) router.push(n.link)
  load()
}
async function readAll() {
  await api.post('/common/notifications/read-all')
  load()
}
onMounted(() => {
  load()
  timer = window.setInterval(load, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <el-popover placement="bottom-end" :width="320" trigger="click" @show="load">
    <template #reference>
      <el-badge :value="unread" :hidden="!unread" :max="99" class="bell">
        <span class="bell-btn"><el-icon :size="18"><Bell /></el-icon></span>
      </el-badge>
    </template>
    <div class="head">
      <b>{{ t('notification.title') }}</b>
      <el-button link type="primary" size="small" :disabled="!unread" @click="readAll">
        {{ t('notification.readAll') }}
      </el-button>
    </div>
    <el-empty v-if="!items.length" :description="t('notification.empty')" :image-size="60" />
    <el-scrollbar v-else max-height="360px">
      <div v-for="n in items" :key="n.id" class="item" :class="{ unread: !n.readAt }" @click="open(n)">
        <div class="t">{{ n.title }}</div>
        <div v-if="n.content" class="c">{{ n.content }}</div>
        <div class="muted">{{ fmtDateTime(n.createdAt) }}</div>
      </div>
    </el-scrollbar>
  </el-popover>
</template>

<style scoped>
.bell { display: flex; align-items: center; }
.bell-btn { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--xh-border); background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #475569; }
.bell-btn:hover { color: var(--xh-primary); }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.item { padding: 8px 4px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.item:hover { background: #f5f7fa; }
.item.unread .t { font-weight: 600; }
.item.unread .t::before { content: '● '; color: var(--el-color-danger); font-size: 10px; }
.c { font-size: 12px; color: #606266; margin: 2px 0; }
</style>
