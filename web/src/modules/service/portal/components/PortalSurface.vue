<script setup lang="ts">
import { useIsMobile } from '@/utils/format'
const mobile = useIsMobile()
</script>

<template><div class="portal-surface" :class="{ mobile }"><slot /></div></template>

<style scoped>
.portal-surface { max-width: 1040px; margin: auto; }
.portal-surface :deep(.section-head) { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.portal-surface :deep(.section-head .page-title) { margin: 0; }
.portal-surface :deep(.card-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.portal-surface :deep(.item-card) { padding: 16px; border: 1px solid var(--xh-border); border-radius: 10px; min-width: 0; overflow-wrap: anywhere; }
.portal-surface :deep(.item-card h4) { margin: 0 0 10px; font-size: 15px; }
.portal-surface :deep(.item-card p) { margin: 8px 0; line-height: 1.7; }
.portal-surface :deep(.meta) { color: var(--xh-text-2); line-height: 1.7; font-size: 13px; }
.portal-surface :deep(.stack) { display: grid; gap: 12px; }
.portal-surface :deep(.row) { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.portal-surface :deep(.preserve) { white-space: pre-wrap; overflow-wrap: anywhere; }
.portal-surface :deep(.accent) { color: var(--xh-primary); }
.portal-surface :deep(a) { color: var(--xh-primary); text-decoration: none; }
.portal-surface :deep(.list-link) { display: block; padding: 14px 0; border-bottom: 1px solid var(--xh-border); line-height: 1.7; overflow-wrap: anywhere; }
.portal-surface :deep(.el-form) { max-width: 640px; }
.portal-surface :deep(.el-button) { min-height: 42px; }
.portal-surface :deep(.el-button.is-link) { white-space: normal; text-align: left; }
.portal-surface :deep(.el-alert) { margin-bottom: 14px; }
.mobile :deep(.card-grid) { grid-template-columns: minmax(0, 1fr); }
.mobile :deep(.submit-button) { width: 100%; }
</style>
