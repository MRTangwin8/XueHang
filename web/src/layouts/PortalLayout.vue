<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { portalChildren } from '@/router'
import { useAuth } from '@/stores/auth'
import NotificationBell from '@/components/NotificationBell.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useSite } from '@/stores/site'
import LangSwitcher from '@/components/LangSwitcher.vue'
import { tt } from '@/i18n'

const { t } = useI18n()

const site = useSite()

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const nav = computed(() =>
  portalChildren
    .filter((r) => r.meta?.portalNav)
    .map((r) => ({ path: '/portal/' + r.path, title: tt(r.meta?.title), icon: r.meta?.icon ?? 'Grid' })),
)

function logout() {
  auth.logout()
  router.push('/portal/login')
}
</script>

<template>
  <div class="portal">
    <header class="bar">
      <BrandLogo :size="28" />
      <span class="tag">{{ site.text('portalTitle') }}</span>
      <nav class="top-nav">
        <router-link v-for="n in nav" :key="n.path" :to="n.path" class="nav-item" :class="{ active: route.path.startsWith(n.path) }">
          <el-icon><component :is="n.icon" /></el-icon><span>{{ n.title }}</span>
        </router-link>
      </nav>
      <span class="spacer" />
      <LangSwitcher />
      <NotificationBell />
      <el-dropdown trigger="click">
        <span class="user"><span class="avatar">{{ auth.me?.name?.slice(-1) }}</span><el-icon><ArrowDown /></el-icon></span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled>{{ auth.me?.name }} · {{ auth.me?.studentNo }}</el-dropdown-item>
            <el-dropdown-item divided icon="SwitchButton" @click="logout">{{ t('layout.signOut') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>
    <main class="body"><router-view /></main>
  </div>
</template>

<style scoped>
.portal { min-height: 100%; display: flex; flex-direction: column; }
.bar { height: 60px; background: #fff; border-bottom: 1px solid var(--xh-border); display: flex; align-items: center; padding: 0 20px; gap: 12px; position: sticky; top: 0; z-index: 10; }
.tag { font-size: 12px; color: var(--xh-primary); background: var(--xh-primary-soft); padding: 2px 8px; border-radius: 10px; }
.spacer { flex: 1; }
.top-nav { display: flex; gap: 4px; margin-left: 16px; }
.nav-item { display: flex; align-items: center; gap: 6px; padding: 8px 12px; color: #475569; text-decoration: none; white-space: nowrap; border-radius: 8px; }
.nav-item:hover { background: #f5f6fb; }
.nav-item.active { color: var(--xh-primary); background: var(--xh-primary-soft); font-weight: 600; }
.user { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #334155; }
.avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #14b8a6); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.body { flex: 1; width: 100%; max-width: 1040px; margin: 0 auto; }
@media (max-width: 767px) {
  .bar { padding: 0 12px; height: 54px; }
  .top-nav { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; z-index: 10; justify-content: space-around; background: #fff; border-top: 1px solid var(--xh-border); padding: 4px 0 calc(4px + env(safe-area-inset-bottom)); }
  .nav-item { flex-direction: column; gap: 2px; font-size: 11px; padding: 4px 6px; background: none !important; }
  .nav-item .el-icon { font-size: 20px; }
  .body { padding-bottom: 72px; }
}
</style>
