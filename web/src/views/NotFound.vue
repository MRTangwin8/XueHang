<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <el-result icon="info" title="404" :sub-title="t('page.notFoundDesc')">
      <template #extra><el-button type="primary" @click="$router.push('/')">{{ t('page.backHome') }}</el-button></template>
    </el-result>
  </div>
</template>
