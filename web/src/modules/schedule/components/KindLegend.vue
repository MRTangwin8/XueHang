<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 课次图例：类型配色 + 状态样式 */
import { kindStyle } from '../utils'

const { t } = useI18n()
</script>

<template>
  <div class="legend">
    <span
      v-for="[k, l] in [['CLASS', t('schedule.groupClass')], ['VIP', 'VIP'], ['OTHER', t('schedule.otherBooking')]]"
      :key="k"
      class="item"
      :style="kindStyle(k)"
    ><i />{{ l }}</span>
    <span class="item state"><el-icon class="ok"><CircleCheckFilled /></el-icon>{{ t('schedule.confirmed') }}</span>
    <span class="item state"><i class="dashed" />{{ t('schedule.endedAwaitingConfirmation') }}</span>
  </div>
</template>

<style scoped>
.legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--xh-text-2); }
.item { display: inline-flex; align-items: center; gap: 5px; }
.item i { width: 14px; height: 10px; border-radius: 3px; background: var(--bg); border-left: 3px solid var(--c); }
.item i.dashed { --c: var(--xh-text-2); --bg: #f1f5f9; border-left-style: dashed; }
.ok { color: var(--xh-teal); }
</style>
