<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** CSS 横向条形图（不依赖图表库）。rows: { label, value, sub?, color?, extra? } */
import { computed } from 'vue'
import type { BarRow } from '../api'

const { t } = useI18n()

const props = defineProps<{ rows: BarRow[]; subLabel?: string; valueLabel?: string }>()
const max = computed(() => Math.max(1, ...props.rows.map((r) => r.value)))
const total = computed(() => props.rows.reduce((s, r) => s + r.value, 0))
const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / max.value) * 100)}%`
const share = (v: number) => (total.value ? Math.round((v / total.value) * 1000) / 10 : 0)
</script>

<template>
  <div class="bars">
    <el-empty v-if="!rows.length || !total" :description="t('common.noData')" :image-size="64" />
    <template v-else>
      <div v-for="r in rows" :key="r.label" class="bar-row">
        <div class="bar-label" :title="r.label">{{ r.label }}</div>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: pct(r.value), background: r.color }" />
          <div v-if="r.sub" class="bar-sub" :style="{ width: pct(r.sub) }" />
        </div>
        <div class="bar-num">
          <b>{{ r.value }}</b>
          <span class="muted">{{ share(r.value) }}%</span>
          <span v-if="r.extra" class="muted">· {{ r.extra }}</span>
        </div>
      </div>
      <div v-if="subLabel" class="legend muted">
        <span><i class="lg main" />{{ valueLabel ?? t('crm.messages.count') }}</span>
        <span><i class="lg sub" />{{ subLabel }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 96px 1fr auto; align-items: center; gap: 10px; }
.bar-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--xh-text); }
.bar-track { position: relative; height: 14px; background: #f1f3f9; border-radius: 7px; overflow: hidden; }
.bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 7px;
  background: linear-gradient(90deg, var(--xh-primary), #818cf8);
  transition: width 0.4s ease;
 
}
.bar-sub { position: absolute; inset: 3px auto 3px 0; border-radius: 4px; background: var(--xh-teal); opacity: 0.95; transition: width 0.4s ease; }
.bar-num { min-width: 92px; font-size: 13px; display: flex; gap: 6px; align-items: baseline; white-space: nowrap; }
.legend { display: flex; gap: 14px; margin-top: 2px; }
.lg { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
.lg.main { background: var(--xh-primary); }
.lg.sub { background: var(--xh-teal); }
@media (max-width: 767px) {
  .bar-row { grid-template-columns: 72px 1fr auto; gap: 8px; }
  .bar-num { min-width: 70px; }
}
</style>
