<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="page"><el-result icon="warning" :title="t('page.forbiddenTitle')" :sub-title="t('page.forbiddenDesc')" /></div>
</template>
