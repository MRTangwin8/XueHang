<script setup lang="ts">
/** 登录页外壳：左侧品牌面板 + 右侧表单（手机上只显示表单） */
import BrandLogo from './BrandLogo.vue'
import LangSwitcher from './LangSwitcher.vue'
import { useSite } from '@/stores/site'
import { useVersion, versionText } from '@/utils/version'

const site = useSite()
const version = useVersion()
const props = defineProps<{ title: string; subtitle?: string; portal?: boolean }>()
const heroTitle = () => site.text(props.portal ? 'portalHeroTitle' : 'heroTitle')
</script>

<template>
  <div class="shell">
    <section class="hero">
      <BrandLogo :size="44" light subtitle />
      <div class="hero-copy">
        <h2>
          <template v-for="(line, index) in heroTitle().split('\n')" :key="index">
            {{ line }}<br v-if="index < heroTitle().split('\n').length - 1" />
          </template>
        </h2>
        <ul v-if="site.points(portal).length">
          <li v-for="(point, index) in site.points(portal)" :key="index">
            <el-icon><component :is="(portal ? ['Calendar', 'TrendCharts', 'ChatDotRound'] : ['Calendar', 'Clock', 'TrendCharts'])[index % 3]" /></el-icon>{{ point }}
          </li>
        </ul>
      </div>
      <div class="hero-foot">{{ site.text('footerText') }}</div>
    </section>
    <section class="form-side">
      <div class="lang"><LangSwitcher /></div>
      <div class="form-box">
        <BrandLogo class="m-logo" :size="36" />
        <h1>{{ title }}</h1>
        <p v-if="subtitle" class="sub">{{ subtitle }}</p>
        <slot />
        <!-- 版本号只在教职工登录页显示，学生端不显示 -->
        <div v-if="!portal && version" class="ver">{{ versionText(version) }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shell { min-height: 100%; display: flex; background: #fff; }
.hero { flex: 1.1; position: relative; overflow: hidden; padding: 40px 56px; color: #fff; display: flex; flex-direction: column; background: radial-gradient(circle at 85% 15%, rgba(20, 184, 166, 0.55), transparent 45%), radial-gradient(circle at 10% 90%, rgba(253, 230, 138, 0.25), transparent 40%), linear-gradient(135deg, color-mix(in srgb, var(--xh-primary) 55%, #0b1026) 0%, var(--xh-primary) 55%, #0f766e 100%); }
.hero::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px); background-size: 40px 40px; mask-image: linear-gradient(to bottom, transparent, #000 40%, transparent); pointer-events: none; }
.hero-copy { margin: auto 0; position: relative; z-index: 1; }
.hero-copy h2 { font-size: 32px; line-height: 1.4; font-weight: 700; margin: 0 0 28px; }
.hero-copy ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
.hero-copy li { display: flex; align-items: center; gap: 10px; font-size: 15px; opacity: 0.92; }
.hero-copy li .el-icon { width: 30px; height: 30px; border-radius: 8px; background: rgba(255, 255, 255, 0.15); }
.hero-foot { font-size: 12px; opacity: 0.6; position: relative; z-index: 1; }
.lang { position: absolute; top: 20px; right: 20px; }
.form-side { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.form-box { width: 100%; max-width: 360px; }
.ver { margin-top: 28px; text-align: center; font-size: 12px; color: var(--xh-text-2); opacity: 0.7; }
.m-logo { display: none; margin-bottom: 20px; }
h1 { font-size: 26px; margin: 0; font-weight: 700; }
.sub { color: var(--xh-text-2); margin: 8px 0 28px; }
@media (max-width: 900px) {
  .hero { display: none; }
  .m-logo { display: inline-flex; }
  .shell { background: linear-gradient(180deg, #eef2ff, #fff 50%); }
}
</style>
