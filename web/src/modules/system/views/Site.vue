<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import BrandLogo from '@/components/BrandLogo.vue'
import FileUpload from '@/components/FileUpload.vue'
import { defaultSite, useSite, type SiteConfig } from '@/stores/site'

const { t } = useI18n()

const site = useSite()
const form = reactive<SiteConfig>({ ...defaultSite(), ...site.config, heroPoints: [...site.config.heroPoints] })
const saving = ref(false)
const colors = ['#4f46e5', '#0d9488', '#0284c7', '#db2777', '#ea580c', '#15803d']
const heroLines = computed(() => form.heroTitle.split('\n'))
watch(() => site.config, (config) => Object.assign(form, config, { heroPoints: [...config.heroPoints] }))

function addPoint() {
  if (form.heroPoints.length < 6) form.heroPoints.push('')
}
function removePoint(index: number) {
  form.heroPoints.splice(index, 1)
}
function movePoint(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= form.heroPoints.length) return
  const [point] = form.heroPoints.splice(index, 1)
  form.heroPoints.splice(target, 0, point)
}
async function save() {
  saving.value = true
  try {
    await site.save({ ...form, heroPoints: form.heroPoints.map((point) => point.trim()) })
    ElMessage.success(t('system.site.saved'))
  } finally {
    saving.value = false
  }
}
async function reset() {
  await ElMessageBox.confirm(t('system.site.resetConfirm'), t('system.site.reset'), { type: 'warning' })
  await site.reset()
  Object.assign(form, site.config, { heroPoints: [...site.config.heroPoints] })
  ElMessage.success(t('system.site.resetDone'))
}
</script>

<template>
  <div class="page">
    <div class="settings-layout">
      <div class="page-card editor">
        <h3 class="page-title">{{ t('system.site.basic') }}</h3>
        <el-form label-position="top">
          <div class="fields">
            <el-form-item :label="t('system.site.name')"><el-input v-model="form.siteName" maxlength="20" show-word-limit /></el-form-item>
            <el-form-item :label="t('system.site.subtitle')"><el-input v-model="form.siteSubtitle" maxlength="30" show-word-limit /></el-form-item>
            <el-form-item :label="t('system.site.browserTitle')"><el-input v-model="form.browserTitle" maxlength="40" show-word-limit /></el-form-item>
          </div>
          <el-form-item label="Logo">
            <div class="logo-control">
              <img v-if="form.logoUrl" :src="form.logoUrl" :alt="t('system.site.logoPreview')" />
              <span v-else class="default-mark" :style="{ backgroundColor: form.primaryColor }">{{ t('system.site.mark') }}</span>
              <FileUpload kind="logo" :tip="t('system.site.logoTip')" @uploaded="(file) => (form.logoUrl = file.url)" />
              <el-button v-if="form.logoUrl" link type="danger" @click="form.logoUrl = null">{{ t('system.site.clear') }}</el-button>
            </div>
          </el-form-item>
        </el-form>

        <h3 class="page-title">{{ t('system.site.color') }}</h3>
        <div class="color-row">
          <el-color-picker v-model="form.primaryColor" :predefine="colors" />
          <button
            v-for="color in colors"
            :key="color"
            class="swatch"
            :class="{ selected: form.primaryColor.toLowerCase() === color }"
            :style="{ backgroundColor: color }"
            :aria-label="t('system.site.useColor', { color })"
            type="button"
            @click="form.primaryColor = color"
          />
          <span class="muted">{{ form.primaryColor }}</span>
        </div>

        <h3 class="page-title">{{ t('system.site.loginPage') }}</h3>
        <div class="fields">
          <el-form-item :label="t('system.site.loginTitle')"><el-input v-model="form.loginTitle" maxlength="40" /></el-form-item>
          <el-form-item :label="t('system.site.loginSubtitle')"><el-input v-model="form.loginSubtitle" maxlength="60" /></el-form-item>
        </div>
        <el-form-item :label="t('system.site.heroTitle')">
        <el-input v-model="form.heroTitle" type="textarea" :rows="3" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('system.site.heroPoints')">
          <div class="points">
            <div v-for="(point, index) in form.heroPoints" :key="index" class="point-row">
              <el-input v-model="form.heroPoints[index]" maxlength="40" />
              <el-button link :disabled="index === 0" :aria-label="t('system.site.up')" @click="movePoint(index, -1)"><el-icon><ArrowUp /></el-icon></el-button>
              <el-button link :disabled="index === form.heroPoints.length - 1" :aria-label="t('system.site.down')" @click="movePoint(index, 1)">
              <el-icon>
              <ArrowDown />
              </el-icon>
              </el-button>
              <el-button link type="danger" :aria-label="t('common.delete')" @click="removePoint(index)"><el-icon><Delete /></el-icon></el-button>
            </div>
            <el-button v-if="form.heroPoints.length < 6" link type="primary" icon="Plus" @click="addPoint">{{ t('system.site.addPoint') }}</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('system.site.footer')"><el-input v-model="form.footerText" maxlength="60" /></el-form-item>

        <h3 class="page-title">{{ t('layout.studentPortal') }}</h3>
        <div class="fields">
          <el-form-item :label="t('system.site.portalTitle')"><el-input v-model="form.portalTitle" maxlength="20" /></el-form-item>
          <el-form-item :label="t('system.site.loginSubtitle')"><el-input v-model="form.portalLoginSubtitle" maxlength="60" /></el-form-item>
        </div>
        <div class="actions">
          <el-button @click="reset">{{ t('system.site.reset') }}</el-button>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </div>
      </div>

      <aside class="preview-column">
        <div class="preview-sticky">
          <h3 class="preview-heading">{{ t('system.site.preview') }}</h3>
          <div class="login-preview">
            <div class="preview-hero" :style="{ '--preview-primary': form.primaryColor }">
              <div class="preview-brand">
                <img v-if="form.logoUrl" :src="form.logoUrl" alt="" />
                <span v-else class="default-mark" :style="{ backgroundColor: form.primaryColor }">{{ t('system.site.mark') }}</span>
                <span><b>{{ form.siteName }}</b><small>{{ form.siteSubtitle }}</small></span>
              </div>
              <div class="preview-copy">
                <h4><template v-for="(line, index) in heroLines" :key="index">{{ line }}<br v-if="index < heroLines.length - 1" /></template></h4>
                <ul v-if="form.heroPoints.length"><li v-for="(point, index) in form.heroPoints" :key="index">{{ point }}</li></ul>
              </div>
              <small>{{ form.footerText }}</small>
            </div>
            <div class="preview-form">
            <BrandLogo :size="25" />
            <b>{{ form.loginTitle }}</b>
            <span>{{ form.loginSubtitle }}</span>
            <div class="fake-input" />
            <div class="fake-button" :style="{ backgroundColor: form.primaryColor }">{{ t('auth.login') }}</div>
            </div>
          </div>
          <div class="preview-sidebar">
            <img v-if="form.logoUrl" :src="form.logoUrl" alt="" />
            <span v-else class="default-mark" :style="{ backgroundColor: form.primaryColor }">{{ t('system.site.mark') }}</span>
            <span><b>{{ form.siteName }}</b><small>{{ form.siteSubtitle }}</small></span>
          </div>
        </div>
      </aside>
      <div class="mobile-preview">
        <h3 class="preview-heading">{{ t('system.site.mobilePreview') }}</h3>
        <div class="mobile-screen" :style="{ '--preview-primary': form.primaryColor }">
          <img v-if="form.logoUrl" class="mobile-logo" :src="form.logoUrl" alt="" />
          <span v-else class="default-mark" :style="{ backgroundColor: form.primaryColor }">{{ t('system.site.mark') }}</span>
          <b>{{ form.siteName }}</b>
          <h4>{{ form.loginTitle }}</h4><p>{{ form.loginSubtitle }}</p>
          <div class="fake-input" /><div class="fake-button" :style="{ backgroundColor: form.primaryColor }">{{ t('auth.login') }}</div>
          <div class="mobile-hero">
          <template v-for="(line, index) in heroLines" :key="index">{{ line }}<br v-if="index < heroLines.length - 1" />
          </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.9fr); gap: 18px; align-items: start; }
.editor { min-width: 0; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.page-title:not(:first-child) { margin-top: 22px; }
.logo-control, .color-row, .point-row, .actions { display: flex; align-items: center; gap: 10px; }
.logo-control img { width: 40px; height: 40px; object-fit: contain; border-radius: 8px; }
.default-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  flex: 0 0 auto;

}
.swatch { width: 24px; height: 24px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 1px var(--xh-border); cursor: pointer; }
.swatch.selected { box-shadow: 0 0 0 2px var(--xh-primary); }
.points { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.point-row .el-input { flex: 1; min-width: 0; }
.actions { justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--xh-border); }
.preview-sticky { position: sticky; top: 20px; }
.preview-heading { margin: 0 0 12px; font-size: 15px; }
.login-preview {
  min-height: 330px;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  border: 1px solid var(--xh-border);
  overflow: hidden;
  background: white;

}
.preview-hero {
  padding: 20px 16px 14px;
  color: white;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, color-mix(in srgb, var(--preview-primary), #312e81 35%), var(--preview-primary), #0f766e);

}
.preview-brand, .preview-sidebar { display: flex; align-items: center; gap: 8px; }
.preview-brand img, .preview-sidebar img, .mobile-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; }
.preview-brand .default-mark, .preview-sidebar .default-mark { width: 32px; height: 32px; }
.preview-brand span:last-child, .preview-sidebar span:last-child { display: flex; flex-direction: column; }
.preview-brand b, .preview-sidebar b { font-size: 13px; }
.preview-brand small, .preview-sidebar small { font-size: 9px; opacity: .8; }
.preview-copy { margin: auto 0; }
.preview-copy h4 { font-size: 15px; line-height: 1.55; margin: 16px 0; }
.preview-copy ul { padding-left: 15px; margin: 0; font-size: 10px; line-height: 1.7; }
.preview-hero small { font-size: 9px; opacity: .8; }
.preview-form { padding: 20px 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
.preview-form b { font-size: 14px; margin-top: 20px; }
.preview-form span, .mobile-screen p { color: var(--xh-text-2); font-size: 11px; }
.fake-input { height: 28px; border: 1px solid var(--xh-border); width: 100%; border-radius: 4px; margin-top: 12px; }
.fake-button { width: 100%; text-align: center; color: white; padding: 7px; font-size: 11px; border-radius: 4px; }
.preview-sidebar { margin-top: 14px; background: white; border: 1px solid var(--xh-border); padding: 14px; }
.mobile-preview { display: none; }
@media (max-width: 900px) {
  .settings-layout { grid-template-columns: minmax(0, 1fr); }
  .preview-column { display: none; }
  .mobile-preview { display: block; }
  .mobile-screen { max-width: 360px; padding: 22px; border: 1px solid var(--xh-border); background: white; }
  .mobile-screen .default-mark, .mobile-logo { width: 30px; height: 30px; }
  .mobile-screen h4 { margin: 26px 0 0; }
  .mobile-screen p { margin-top: 6px; }
  .mobile-hero { margin-top: 30px; padding: 18px; color: white; background: var(--preview-primary); line-height: 1.6; }
}
@media (max-width: 600px) { .fields { grid-template-columns: 1fr; } }
</style>
