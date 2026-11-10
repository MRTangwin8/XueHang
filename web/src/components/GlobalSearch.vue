<script setup lang="ts">
/**
 * 后台顶栏搜索：输入关键字，跳转到菜单页面、设置项（业务规则的每一项、成绩与档案设置的各页签……）
 * 或直接打开学员档案。快捷键：Ctrl / ⌘ + K。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { adminChildren } from '@/router'
import { MENU_GROUPS } from '@/menu'
import { tt } from '@/i18n'
import { api } from '@/api/http'
import { useAuth } from '@/stores/auth'

interface Item { key: string; title: string; path: string; kind: 'page' | 'setting' | 'student'; group?: string; words?: string }

const { t, te } = useI18n()
const router = useRouter()
const auth = useAuth()
const q = ref('')
const input = ref<{ focus: () => void; blur: () => void }>()

/** 菜单页面 */
const pages = computed<Item[]>(() =>
  adminChildren
    .filter((r) => r.meta?.title && !r.meta?.hidden && auth.can(r.meta?.perm))
    .map((r) => {
      const g = MENU_GROUPS.find((x) => x.key === r.meta?.group)
      return { key: 'p:' + r.path, title: tt(r.meta?.title as string), path: '/' + r.path, kind: 'page' as const, group: g ? t(g.title) : '' }
    }),
)

/** 设置项：业务规则的分组与字段、成绩与档案设置、站点 / 邮件设置的要点 */
const RULE_GROUPS: Record<string, string[]> = {
  vip: ['vipAutoConfirmEnabled', 'vipAutoConfirmHours', 'vipStudentConfirm', 'vipRecordRequired'],
  interview: ['interviewCancelLockHours', 'interviewConfirmText'],
  document: ['documentEditHours', 'documentMaxEdits', 'documentReturnDays', 'documentRulesText'],
  print: ['printFileTypes', 'printCurrency', 'printPriceBW', 'printPriceColor', 'printCutoff', 'printReadyTime', 'printGuideText'],
  money: ['wageCurrency'],
  student: ['maxAdmissions'],
  board: ['sessionRoomRequired', 'boardStartHour', 'boardEndHour'],
  customer: ['customerRecycleEnabled', 'customerRecycleDays'],
  numbering: ['studentNoPrefix', 'orderNoPrefix', 'uploadMaxMB'],
  login: ['loginLockEnabled', 'loginMaxFailures', 'loginIpMaxFailures', 'loginLockMinutes', 'sessionDays'],
  portal: ['portalModules', 'portalHomeSections', 'portalWelcomeTitle', 'portalWelcomeText', 'portalHomeShowFiles', 'portalGradeShowRank', 'portalGradeShowAverage', 'portalGradeShowBest'],
  timetable: ['timetableExportTitle', 'timetableExportFooter', 'timetableExportShowTeacher', 'timetableExportShowRoom'],
  demo: ['readOnlyCanSchedule'],
  dicts: [],
}
const settings = computed<Item[]>(() => {
  const out: Item[] = []
  const rulesTitle = t('system.menu.rules')
  if (auth.can('system.rules')) {
    for (const [g, fields] of Object.entries(RULE_GROUPS)) {
      out.push({ key: 's:rules:' + g, title: t(`system.rules.groups.${g}`), path: `/system/rules?tab=${g}`, kind: 'setting', group: rulesTitle })
      for (const f of fields) {
        const k = `system.rules.fields.${f}`
        if (te(k)) out.push({ key: 's:rule:' + f, title: t(k), path: `/system/rules?tab=${g}`, kind: 'setting', group: `${rulesTitle} · ${t(`system.rules.groups.${g}`)}` })
      }
    }
  }
  if (auth.can('system.edu')) {
    const eduTitle = t('grades.menu.settings')
    for (const [tab, key] of [['presets', 'presets'], ['exams', 'examTypes'], ['templates', 'templates'], ['fields', 'fields']] as const)
      out.push({ key: 's:edu:' + tab, title: t(`grades.settings.${key}`), path: `/system/edu?tab=${tab}`, kind: 'setting', group: eduTitle })
  }
  if (auth.can('system.site')) {
    const siteTitle = t('system.menu.site')
    for (const k of ['siteName', 'heroTitle', 'heroPoints', 'portalTitle'])
      if (te(`system.site.${k}`)) out.push({ key: 's:site:' + k, title: t(`system.site.${k}`), path: '/system/site', kind: 'setting', group: siteTitle })
  }
  if (auth.can('system.role'))
    out.push({ key: 's:readonly', title: t('system.role.readOnly'), path: '/system/roles', kind: 'setting', group: t('system.menu.roles') })
  if (auth.can('system.user'))
    out.push({ key: 's:campuses', title: t('system.user.manageCampuses'), path: '/system/users', kind: 'setting', group: t('system.menu.users') })
  return out
})

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
async function fetchSuggestions(text: string, cb: (items: Item[]) => void) {
  const k = norm(text ?? '')
  if (!k) return cb(pages.value.slice(0, 8))
  const hit = (i: Item) => norm(i.title).includes(k) || norm(i.group ?? '').includes(k) || norm(i.words ?? '').includes(k)
  const list = [...pages.value.filter(hit), ...settings.value.filter(hit)].slice(0, 12)
  // 学员：按姓名 / 学号查找（有学员查看权限时）
  if (k.length >= 2 && auth.can(['student.view', 'student.all', 'teacher.students'])) {
    try {
      const rows = await api.get<{ id: number; name: string; studentNo: string }[]>('/common/students', { q: text.trim() })
      list.push(...rows.slice(0, 6).map((s) => ({ key: 'st:' + s.id, title: `${s.name} · ${s.studentNo}`, path: `/students/${s.id}`, kind: 'student' as const, group: t('search.student') })))
    } catch {
      /* 忽略 */
    }
  }
  cb(list)
}
function go(item: Record<string, unknown>) {
  const it = item as unknown as Item
  q.value = ''
  input.value?.blur()
  router.push(it.path)
}
const kindIcon = { page: 'Menu', setting: 'Setting', student: 'User' }

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    input.value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <el-autocomplete
    ref="input"
    v-model="q"
    class="global-search"
    style="width: 100%"
    :fetch-suggestions="fetchSuggestions"
    :placeholder="t('search.placeholder')"
    :trigger-on-focus="false"
    value-key="title"
    clearable
    popper-class="global-search-popper"
    :debounce="200"
    @select="go"
  >
    <template #prefix><el-icon><Search /></el-icon></template>
    <template #default="{ item }">
      <div class="gs-item">
        <el-icon class="gs-icon"><component :is="kindIcon[(item as Item).kind]" /></el-icon>
        <span class="gs-title">{{ (item as Item).title }}</span>
        <span class="gs-group">{{ (item as Item).group }}</span>
      </div>
    </template>
  </el-autocomplete>
</template>

<style scoped>
.gs-item { display: flex; align-items: center; gap: 8px; line-height: 1.4; padding: 2px 0; }
.gs-icon { color: var(--xh-primary); }
.gs-title { font-weight: 500; }
.gs-group { margin-left: auto; font-size: 12px; color: var(--xh-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
</style>
