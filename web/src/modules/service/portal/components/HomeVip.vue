<script setup lang="ts">
/** 学生端首页 · 我的课时：各 VIP 课时包的剩余课时 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { portalApi, type PortalPackage } from '@/modules/schedule/api'

const { t } = useI18n()
const packages = ref<PortalPackage[]>([])
const loaded = ref(false)
onMounted(async () => {
  try {
    packages.value = (await portalApi.vip()).packages
  } catch {
    packages.value = []
  } finally {
    loaded.value = true
  }
})
const active = computed(() => packages.value.filter((p) => p.status === 'ACTIVE').slice(0, 3))
const num = (n: number) => Math.round(n * 100) / 100
</script>

<template>
  <section class="page-card">
    <div class="section-head">
      <h3 class="page-title">{{ t('service.text.homeVipHours') }}</h3>
      <router-link to="/portal/vip">{{ t('service.text.more') }}</router-link>
    </div>
    <div v-for="p in active" :key="p.id" class="pkg">
      <div class="row">
        <span class="name">{{ p.name }}</span>
        <b class="remain">{{ t('service.text.homeRemaining', { n: num(p.remaining) }) }}</b>
      </div>
      <el-progress :percentage="p.totalHours ? Math.min(100, Math.round((p.usedHours / p.totalHours) * 100)) : 0" :show-text="false" :stroke-width="6" />
      <div v-if="p.pendingHours" class="meta">{{ t('service.text.homePending', { n: num(p.pendingHours) }) }}</div>
    </div>
    <p v-if="loaded && !active.length" class="meta empty">{{ t('service.text.homeNoVip') }}</p>
  </section>
</template>

<style scoped>
.pkg { padding: 8px 0; }
.pkg + .pkg { border-top: 1px solid var(--xh-border); }
.name { font-weight: 600; }
.remain { color: var(--xh-primary); }
.empty { margin: 4px 0; }
</style>
