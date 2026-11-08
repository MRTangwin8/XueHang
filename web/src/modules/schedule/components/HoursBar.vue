<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** VIP 课时进度条：已确认 / 待确认 / 剩余 */
import { computed } from 'vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{ total: number; used: number; pending: number; showText?: boolean }>(), { showText: true })
const pct = (v: number) => (props.total > 0 ? Math.min(100, (v / props.total) * 100) : 0)
const remaining = computed(() => Math.round((props.total - props.used - props.pending) * 100) / 100)
</script>

<template>
  <div class="hbar">
    <div class="track">
      <div class="used" :style="{ width: `${pct(used)}%` }" />
      <div class="pending" :style="{ width: `${pct(pending)}%` }" />
    </div>
    <div v-if="showText" class="nums">
      <span><i class="u" />{{ t('schedule.confirmedH', { p0: used }) }}</span>
      <span><i class="p" />{{ t('schedule.pendingH', { p0: pending }) }}</span>
      <span :class="{ 'text-danger': remaining <= 0 }"><i class="r" />{{ t('schedule.remainingH', { p0: remaining }) }}</span>
      <span class="muted">{{ t('schedule.totalH', { p0: total }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.hbar { min-width: 180px; }
.track { display: flex; height: 8px; border-radius: 4px; background: #e9edf5; overflow: hidden; }
.used { background: var(--xh-teal); }
.pending { background: var(--xh-kind-vip); }
.nums { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; font-size: 12px; }
.nums span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.nums i { width: 8px; height: 8px; border-radius: 2px; }
.nums .u { background: var(--xh-teal); }
.nums .p { background: var(--xh-kind-vip); }
.nums .r { background: #e9edf5; }
</style>
