import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import './styles/main.css'
import App from './App.vue'
import { router } from './router'
import { i18n, applyLocaleSideEffects } from './i18n'
import { useDict } from './stores/dict'
import { useSite } from './stores/site'
import { updateTitle } from './utils/title'

const app = createApp(App)
for (const [name, comp] of Object.entries(Icons)) app.component(name, comp)
app.use(createPinia())
app.use(i18n)
// Element Plus 的语言由 App.vue 的 <el-config-provider> 随界面语言切换
app.use(ElementPlus)
app.use(router)
applyLocaleSideEffects()

const dict = useDict()
const site = useSite()
// 站点设置或界面语言变化时刷新浏览器标题
watch([() => site.config, () => i18n.global.locale.value], () => updateTitle(router.currentRoute.value), { deep: true })

Promise.all([dict.load().catch(() => undefined), site.load()]).then(() => {
  site.applyTheme()
  app.mount('#app')
})
