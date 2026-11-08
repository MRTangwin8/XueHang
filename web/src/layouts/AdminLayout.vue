<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminChildren } from '@/router'
import { MENU_GROUPS } from '@/menu'
import { useAuth } from '@/stores/auth'
import { useIsMobile } from '@/utils/format'
import NotificationBell from '@/components/NotificationBell.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LangSwitcher from '@/components/LangSwitcher.vue'
import { useI18n } from 'vue-i18n'
import { tt } from '@/i18n'

const { t } = useI18n()

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const hidden = ref(false)
const drawer = ref(false)

/** 菜单由路由 meta 自动生成：分组 → meta.order 排序 → 权限过滤 */
const menu = computed(() =>
  MENU_GROUPS.map((g) => ({
    ...g,
    items: adminChildren
      .filter((r) => r.meta?.group === g.key && !r.meta?.hidden && auth.can(r.meta?.perm))
      .sort((a, b) => (a.meta?.order ?? 50) - (b.meta?.order ?? 50))
      .map((r) => ({ path: '/' + r.path, title: tt(r.meta?.title) || r.path })),
  })).filter((g) => g.items.length),
)

/** 分组折叠状态（默认展开当前分组 + 前三个） */
const folded = reactive<Record<string, boolean>>({})
const isOpen = (key: string) => folded[key] !== true
const toggle = (key: string) => (folded[key] = isOpen(key))

const isActive = (p: string) => (p === '/' ? route.path === '/' : route.path === p || route.path.startsWith(p + '/'))
const groupTitle = computed(() => (route.meta.group ? t(`menu.${route.meta.group}`) : ''))
const initial = computed(() => auth.me?.name?.slice(-1) ?? '')

watch(() => route.fullPath, () => (drawer.value = false))

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout">
    <!-- 侧栏（桌面） / 抽屉（手机） -->
    <aside v-if="!isMobile && !hidden" class="sidebar">
      <div class="logo" @click="router.push('/')"><BrandLogo subtitle /></div>
      <el-scrollbar class="nav-scroll">
        <nav class="nav">
          <div v-for="g in menu" :key="g.key" class="group">
            <div class="group-head" @click="toggle(g.key)">
              <el-icon><component :is="g.icon" /></el-icon>
              <span>{{ t(`menu.${g.key}`) }}</span>
              <el-icon class="caret" :class="{ open: isOpen(g.key) }"><ArrowRight /></el-icon>
            </div>
            <div v-show="isOpen(g.key)" class="items">
              <router-link v-for="it in g.items" :key="it.path" :to="it.path" class="item" :class="{ active: isActive(it.path) }">{{ it.title }}</router-link>
            </div>
          </div>
        </nav>
      </el-scrollbar>
    </aside>

    <el-drawer v-if="isMobile" v-model="drawer" direction="ltr" size="260px" :with-header="false" class="xh-drawer">
      <div class="sidebar mobile">
        <div class="logo"><BrandLogo subtitle /></div>
        <nav class="nav">
          <div v-for="g in menu" :key="g.key" class="group">
            <div class="group-head" @click="toggle(g.key)">
              <el-icon><component :is="g.icon" /></el-icon><span>{{ t(`menu.${g.key}`) }}</span>
              <el-icon class="caret" :class="{ open: isOpen(g.key) }"><ArrowRight /></el-icon>
            </div>
            <div v-show="isOpen(g.key)" class="items">
              <router-link v-for="it in g.items" :key="it.path" :to="it.path" class="item" :class="{ active: isActive(it.path) }">{{ it.title }}</router-link>
            </div>
          </div>
        </nav>
      </div>
    </el-drawer>

    <section class="main">
      <header class="topbar">
        <button class="icon-btn" :title="hidden ? t('layout.expandMenu') : t('layout.collapseMenu')" @click="isMobile ? (drawer = true) : (hidden = !hidden)">
          <el-icon :size="18"><Fold v-if="!hidden && !isMobile" /><Expand v-else /></el-icon>
        </button>
        <div class="crumb">
          <span v-if="groupTitle && !isMobile" class="crumb-group">{{ groupTitle }}</span>
          <el-icon v-if="groupTitle && !isMobile" class="crumb-sep"><ArrowRight /></el-icon>
          <span class="crumb-title">{{ tt(route.meta.title) }}</span>
        </div>
        <span class="spacer" />
        <el-tag v-if="auth.me?.campusName && !isMobile" effect="plain" round class="campus">
          <el-icon style="vertical-align: -2px"><OfficeBuilding /></el-icon> {{ auth.me.campusName }}
        </el-tag>
        <LangSwitcher />
        <NotificationBell />
        <el-dropdown trigger="click">
          <span class="user">
            <span class="avatar">{{ initial }}</span>
            <span v-if="!isMobile" class="uname">{{ auth.me?.name }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ auth.me?.roleNames?.join(' / ') }}</el-dropdown-item>
              <el-dropdown-item divided icon="User" @click="router.push('/profile')">{{ t('profile.title') }}</el-dropdown-item>
              <el-dropdown-item icon="SwitchButton" @click="logout">{{ t('layout.logout') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <div v-if="auth.weakPassword && route.path !== '/profile'" class="weak-pw">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ t('layout.weakPassword') }}</span>
        <el-button size="small" type="warning" @click="router.push('/profile')">{{ t('layout.changeNow') }}</el-button>
      </div>
      <main class="content">
        <router-view />
      </main>
    </section>
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100%; }
.sidebar { width: var(--xh-sidebar-w); background: var(--xh-sidebar-bg); border-right: 1px solid var(--xh-border); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar.mobile { width: 100%; min-height: 100%; border: none; }
.logo { height: 64px; display: flex; align-items: center; padding: 0 20px; cursor: pointer; flex-shrink: 0; border-bottom: 1px solid var(--xh-border); }
.nav-scroll { flex: 1; }
.nav { padding: 10px 12px 24px; }
.group { margin-bottom: 4px; }
.group-head { display: flex; align-items: center; gap: 10px; padding: 9px 10px; color: #334155; font-weight: 600; font-size: 13.5px; cursor: pointer; border-radius: 8px; user-select: none; }
.group-head:hover { background: #f5f6fb; }
.group-head .el-icon:first-child { color: var(--xh-primary); font-size: 16px; }
.caret { margin-left: auto; font-size: 12px; color: #94a3b8; transition: transform 0.15s; }
.caret.open { transform: rotate(90deg); }
.items { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 6px; }
.item { display: block; padding: 8px 10px 8px 36px; border-radius: 8px; color: #475569; text-decoration: none; font-size: 13.5px; position: relative; }
.item:hover { background: #f5f6fb; color: var(--xh-text); }
.item.active { background: var(--xh-primary-soft); color: var(--xh-primary); font-weight: 600; }
.item.active::before { content: ''; position: absolute; left: 20px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--xh-primary); }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar { height: 64px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid var(--xh-border); display: flex; align-items: center; padding: 0 20px; gap: 14px; flex-shrink: 0; position: sticky; top: 0; z-index: 5; }
.icon-btn { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--xh-border); background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #475569; }
.icon-btn:hover { color: var(--xh-primary); border-color: var(--el-color-primary-light-7); }
.crumb { display: flex; align-items: center; gap: 6px; min-width: 0; }
.crumb-group { color: var(--xh-text-2); }
.crumb-sep { color: #cbd5e1; font-size: 12px; }
.crumb-title { font-weight: 650; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spacer { flex: 1; }
.campus { border-color: var(--xh-border); color: #475569; }
.user { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #334155; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #14b8a6); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
.uname { font-weight: 500; }
.content { flex: 1; overflow: auto; }
.weak-pw { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 20px; background: #fffbeb; border-bottom: 1px solid #fde68a; color: #92400e; font-size: 13px; }
.weak-pw .el-icon { color: #d97706; }
:global(.xh-drawer .el-drawer__body) { padding: 0; }
@media (max-width: 767px) {
  .topbar { height: 56px; padding: 0 12px; gap: 10px; }
}
</style>
