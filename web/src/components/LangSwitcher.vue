<script setup lang="ts">
/** 语言切换（顶栏 / 学生端 / 登录页）。<LangSwitcher /> 或 <LangSwitcher plain />（无边框，深色背景用 light） */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { LOCALES, setLocale, type LocaleCode } from '@/i18n'

defineProps<{ light?: boolean }>()
const { locale, t } = useI18n()
const current = computed(() => LOCALES.find((l) => l.code === locale.value) ?? LOCALES[0])
</script>

<template>
  <el-dropdown trigger="click" @command="(c: LocaleCode) => setLocale(c)">
    <button type="button" class="lang-btn" :class="{ light }" :title="t('layout.language')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
      <span class="name">{{ current.name }}</span>
      <el-icon :size="12"><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="l in LOCALES" :key="l.code" :command="l.code" :class="{ active: l.code === locale }">
          {{ l.name }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.lang-btn { height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--xh-border); background: #fff; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: #475569; font-size: 13px; }
.lang-btn:hover { color: var(--xh-primary); }
.lang-btn.light { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.3); color: #fff; }
.active { color: var(--xh-primary); font-weight: 600; }
@media (max-width: 767px) {
  .name { display: none; }
}
</style>
