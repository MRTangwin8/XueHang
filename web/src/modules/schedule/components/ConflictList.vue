<script setup lang="ts">
/** 冲突明细列表 */
import { fmtMonthDay } from '@/utils/time'
import type { ConflictInfo } from '../api'
import { KIND_LABEL, REASON_LABEL, kindStyle, timeRange } from '../utils'

defineProps<{ items: ConflictInfo[]; compact?: boolean }>()
</script>

<template>
  <ul class="conflicts" :class="{ compact }">
    <li v-for="c in items" :key="c.sessionId" :style="kindStyle(c.kind)">
      <span class="when">{{ fmtMonthDay(c.startAt) }} {{ timeRange(c) }}</span>
      <span class="kind">{{ KIND_LABEL[c.kind] }}</span>
      <span class="title">{{ c.title }}</span>
      <span class="meta">
        <template v-if="c.room">{{ c.room.name }}</template>
        <template v-if="c.teacher"> · {{ c.teacher.name }}</template>
        <template v-if="c.student && c.kind === 'VIP'"> · {{ c.student.name }}</template>
      </span>
      <el-tag v-for="r in c.reasons" :key="r" type="danger" size="small" effect="plain" disable-transitions>{{ REASON_LABEL[r] }}</el-tag>
    </li>
  </ul>
</template>

<style scoped>
.conflicts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.conflicts li {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px;
  background: #fff5f5; border-left: 3px solid var(--c); font-size: 13px;
}
.compact li { padding: 3px 8px; font-size: 12px; }
.when { font-variant-numeric: tabular-nums; color: var(--xh-text); font-weight: 600; }
.kind { color: var(--c); background: var(--bg); padding: 0 6px; border-radius: 4px; font-size: 12px; }
.title { font-weight: 500; }
.meta { color: var(--xh-text-2); }
</style>
