<script setup lang="ts">
/** 根组件：Element Plus 的组件文案（分页、日期选择器等）随界面语言切换 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import ja from 'element-plus/es/locale/lang/ja'
import fr from 'element-plus/es/locale/lang/fr'
import es from 'element-plus/es/locale/lang/es'
import ru from 'element-plus/es/locale/lang/ru'
import ptBr from 'element-plus/es/locale/lang/pt-br'
import de from 'element-plus/es/locale/lang/de'

const EP_LOCALES = { 'zh-CN': zhCn, en, ja, fr, es, ru, pt: ptBr, de } as const
const { locale } = useI18n()
const epLocale = computed(() => EP_LOCALES[locale.value as keyof typeof EP_LOCALES] ?? zhCn)
</script>

<template>
  <el-config-provider :locale="epLocale">
    <router-view />
  </el-config-provider>
</template>
