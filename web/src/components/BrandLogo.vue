<script setup lang="ts">
/**
 * 品牌标识「学航」：书页 + 航向箭头。
 * <BrandLogo />            图标 + 文字
 * <BrandLogo icon-only />  仅图标
 * <BrandLogo light />      深色背景上使用（白字）
 */
import { useSite } from '@/stores/site'

const site = useSite()
withDefaults(defineProps<{ size?: number; iconOnly?: boolean; light?: boolean; subtitle?: boolean }>(), { size: 32 })
</script>

<template>
  <span class="brand" :class="{ light }">
    <img v-if="site.config.logoUrl" :src="site.config.logoUrl" :width="size" :height="size" alt="" class="logo-image" />
    <svg v-else :width="size" :height="size" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="xh-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--xh-primary)" />
          <stop offset="1" stop-color="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#xh-g)" />
      <!-- 打开的书页 -->
      <path d="M9 13.5c3.6-1.6 7.3-1.4 11 .9v14.2c-3.7-2.3-7.4-2.5-11-.9z" fill="#fff" opacity=".92" />
      <path d="M31 13.5c-3.6-1.6-7.3-1.4-11 .9v14.2c3.7-2.3 7.4-2.5 11-.9z" fill="#fff" opacity=".7" />
      <!-- 航向箭头 -->
      <path d="M24.5 8.5l6 1.2-1.2 6-1.9-1.9-4.6 4.6-1.6-1.6 4.6-4.6z" fill="#fde68a" />
    </svg>
    <span v-if="!iconOnly" class="text">
      <span class="name">{{ site.text('siteName') }}</span>
      <span v-if="subtitle" class="sub">{{ site.text('siteSubtitle') }}</span>
    </span>
  </span>
</template>

<style scoped>
.brand { display: inline-flex; align-items: center; gap: 10px; }
.logo-image { border-radius: 8px; object-fit: contain; flex-shrink: 0; }
.text { display: flex; flex-direction: column; line-height: 1.1; }
.name { font-size: 19px; font-weight: 700; letter-spacing: 3px; color: #1e1b4b; }
.sub { font-size: 11px; color: #64748b; letter-spacing: 1px; margin-top: 3px; }
.light .name { color: #fff; }
.light .sub { color: rgba(255, 255, 255, 0.7); }
</style>
