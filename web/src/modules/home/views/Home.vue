<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { fmtDate, fmtTime, tz } from '@/utils/time'
import { dashboardApi, fileSize, type Dashboard, type DashTodo } from '@/modules/service/api'

const { t: tr, locale } = useI18n()

const auth = useAuth()
const router = useRouter()
const data = ref<Dashboard | null>(null)
const loading = ref(true)

const now = tz()
const greeting = computed(() => {
  const h = now.hour()
  if (h < 6) return tr('home.text.itSLate')
  if (h < 11) return tr('home.text.goodMorning')
  if (h < 13) return tr('home.text.goodAfternoon')
  if (h < 18) return tr('home.text.goodAfternoon2')
  return tr('home.text.goodEvening')
})
const dateText = computed(() => now.locale(locale.value === 'zh-CN' ? 'zh-cn' : locale.value === 'pt' ? 'pt-br' : locale.value)
  .format(tr('home.text.mmmmDYyyy') + ' ddd'))
const todoTotal = computed(() => (data.value?.todos ?? []).filter((t) => !t.key.startsWith('today')).reduce((s, t) => s + t.count, 0))

const quick = computed(() =>
  [
    { title: tr('home.text.writeDailyReport'), desc: tr('home.text.recordTodaySWorkAndFollowUps'), icon: 'EditPen',
      to: '/crm/daily', show: auth.can('daily.write'), cls: 'q-indigo' },
    { title: tr('home.text.publishANotice'), desc: tr('home.text.sendToStaffOrStudents'), icon: 'Promotion',
      to: '/service/notices?create=1', show: auth.can('notice.manage'), cls: 'q-teal' },
  ].filter((q) => q.show),
)

const TONE: Record<string, string> = { primary: '#4f46e5', warning: '#d97706', danger: '#dc2626', success: '#059669', info: '#0891b2' }
const toneColor = (t: string) => TONE[t] ?? TONE.primary
const todoLabel = (todo: DashTodo) => tr(`home.todos.${todo.key}`, todo.label)

async function load() {
  loading.value = true
  try {
    data.value = await dashboardApi.get()
  } finally {
    loading.value = false
  }
}
onMounted(load)

const todayRef = ref<HTMLElement | null>(null)
async function openTodo(t: DashTodo) {
  if (t.link === '#today') {
    await nextTick()
    todayRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else router.push(t.link)
}

const kindLabel = (k: string) => (k === 'CLASS' ? tr('home.text.groupClass') : k === 'VIP' ? 'VIP' : tr('home.text.other'))
const kindClass = (k: string) => (k === 'CLASS' ? 'k-class' : k === 'VIP' ? 'k-vip' : 'k-other')
const isNow = (s: { startAt: string; endAt: string }) => {
  const t = Date.now()
  return +new Date(s.startAt) <= t && t < +new Date(s.endAt)
}
const isPast = (s: { endAt: string }) => +new Date(s.endAt) < Date.now()

const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return { t: 'PDF', c: '#dc2626' }
  if (['doc', 'docx'].includes(ext)) return { t: 'DOC', c: '#2563eb' }
  if (['xls', 'xlsx'].includes(ext)) return { t: 'XLS', c: '#059669' }
  if (['ppt', 'pptx'].includes(ext)) return { t: 'PPT', c: '#ea580c' }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { t: 'IMG', c: '#7c3aed' }
  if (ext === 'zip') return { t: 'ZIP', c: '#64748b' }
  return { t: ext.toUpperCase().slice(0, 3) || 'FILE', c: '#64748b' }
}
</script>

<template>
  <div class="page home" v-loading="loading">
    <!-- 顶部问候 + 快捷入口 -->
    <section class="hero">
      <div class="hero-text">
        <div class="hello">{{ tr('home.summary.greeting', { greeting, name: auth.me?.name }) }}</div>
        <div class="sub">
          <span>{{ dateText }}</span>
          <span v-if="auth.me?.campusName" class="dot">·</span>
          <span v-if="auth.me?.campusName">{{ auth.me?.campusName }}</span>
          <span v-if="auth.me?.roleNames?.length" class="dot">·</span>
          <span v-if="auth.me?.roleNames?.length">{{ auth.me?.roleNames?.join(' / ') }}</span>
        </div>
        <div class="summary" v-if="data">
          <i18n-t v-if="todoTotal" keypath="home.summary.todos" scope="global">
            <template #n><b>{{ todoTotal }}</b></template>
          </i18n-t>
          <template v-else>{{ tr('home.text.nothingPendingHaveAProductiveDay') }}</template>
          <i18n-t v-if="data.todaySessions.length" keypath="home.summary.classes" scope="global">
            <template #n><b>{{ data.todaySessions.length }}</b></template>
          </i18n-t>{{ tr('home.summary.period') }}
        </div>
      </div>
      <div class="quick">
        <router-link v-for="q in quick" :key="q.title" :to="q.to" class="quick-card" :class="q.cls">
          <span class="q-icon"><el-icon :size="22"><component :is="q.icon" /></el-icon></span>
          <span class="q-body"><span class="q-title">{{ q.title }}</span><span class="q-desc">{{ q.desc }}</span></span>
          <el-icon class="q-arrow"><ArrowRight /></el-icon>
        </router-link>
      </div>
    </section>
    <!-- 待办 -->
    <div v-if="data?.todos.length" class="stat-grid todo-grid">
      <div v-for="todo in data.todos" :key="todo.key" class="stat todo" :class="{ zero: !todo.count }" @click="openTodo(todo)">
        <span class="todo-icon" :style="{ color: toneColor(todo.tone), background: toneColor(todo.tone) + '14' }">
          <el-icon :size="20"><component :is="todo.icon" /></el-icon>
        </span>
        <div>
          <div class="stat-label">{{ todoLabel(todo) }}</div>
          <div class="stat-value" :style="{ color: todo.count ? toneColor(todo.tone) : undefined }">{{ todo.count }}</div>
        </div>
      </div>
    </div>
    <!-- 通知 / 资料 -->
    <div class="two-col">
      <div class="page-card list-card">
        <div class="card-head">
          <h3 class="page-title">{{ tr('home.text.notices') }}</h3>
          <router-link to="/teacher/notices" class="more">{{ tr('common.more') }}<el-icon><ArrowRight /></el-icon></router-link>
        </div>
        <el-empty v-if="!data?.notices.length" :description="tr('home.text.noNotices')" :image-size="64" />
        <router-link v-for="n in data?.notices ?? []" :key="n.id" :to="`/teacher/notices?id=${n.id}`" class="row">
          <el-tag v-if="n.pinned" size="small" type="danger" effect="plain" class="pin">{{ tr('home.text.pinned') }}</el-tag>
          <span class="row-title">{{ n.title }}</span>
          <span class="row-meta">{{ fmtDate(n.publishedAt) }}</span>
        </router-link>
      </div>
      <div class="page-card list-card">
        <div class="card-head">
          <h3 class="page-title">{{ tr('home.text.resources') }}</h3>
          <router-link to="/teacher/files" class="more">{{ tr('common.more') }}<el-icon><ArrowRight /></el-icon></router-link>
        </div>
        <el-empty v-if="!data?.files.length" :description="tr('home.text.noResources')" :image-size="64" />
        <a v-for="f in data?.files ?? []" :key="f.id" :href="f.fileUrl" target="_blank" rel="noopener" :download="f.fileName" class="row">
          <span class="ficon" :style="{ background: fileIcon(f.fileName).c }">{{ fileIcon(f.fileName).t }}</span>
          <span class="row-title">{{ f.title }}</span>
          <span class="row-meta">{{ fileSize(f.fileSize) || fmtDate(f.createdAt) }}</span>
        </a>
      </div>
    </div>
    <!-- 今日课程 -->
    <div ref="todayRef" id="today" class="page-card">
      <div class="card-head">
        <h3 class="page-title">{{ tr('home.text.todaySClasses') }}</h3>
        <span class="muted">{{ dateText }}</span>
      </div>
      <el-empty v-if="!data?.todaySessions.length && !data?.todayInterviews.length" :description="tr('home.text.noClassesScheduledToday')" :image-size="72" />
      <div v-else class="timeline">
        <div v-for="s in data?.todaySessions ?? []" :key="'s' + s.id" class="tl-item" :class="[kindClass(s.kind), { past: isPast(s), now: isNow(s) }]">
          <div class="tl-time">
            <b>{{ fmtTime(s.startAt) }}</b><span>{{ fmtTime(s.endAt) }}</span>
          </div>
          <div class="tl-card">
            <div class="tl-title">
              <span class="kind-chip">{{ kindLabel(s.kind) }}</span>
              {{ s.title }}
              <el-tag v-if="isNow(s)" size="small" type="success" effect="dark" round>{{ tr('home.text.inProgress') }}</el-tag>
            </div>
            <div class="tl-meta">
              <span v-if="s.room"><el-icon><Location /></el-icon>{{ s.room.name }}</span>
              <span v-if="s.kind === 'CLASS'"><el-icon><User /></el-icon>{{ tr('home.summary.students', { n: s.studentCount }) }}</span>
              <span v-if="s.studentName"><el-icon><User /></el-icon>{{ s.studentName }}</span>
              <router-link v-if="s.kind === 'CLASS' && auth.can('attendance.manage')" :to="`/service/attendance?session=${s.id}`" class="tl-link">
                {{ s.attendanceRecorded ? tr('home.text.studentsMarked', { v0: s.attendanceRecorded }) : tr('home.text.takeAttendance') }}
              </router-link>
            </div>
          </div>
        </div>
        <div v-for="i in data?.todayInterviews ?? []" :key="'i' + i.id" class="tl-item k-talk" :class="{ past: isPast(i), now: isNow(i) }">
          <div class="tl-time">
            <b>{{ fmtTime(i.startAt) }}</b><span>{{ fmtTime(i.endAt) }}</span>
          </div>
          <div class="tl-card">
            <div class="tl-title">
              <span class="kind-chip">{{ i.kind === 'EXAM' ? tr('home.text.interview') : tr('home.text.consultation') }}</span>
              {{ i.title }}<template v-if="i.student"> · {{ i.student.name }}</template>
            </div>
            <div class="tl-meta">
              <span><el-icon><Location /></el-icon>{{ i.online ? tr('home.text.online') : i.location || tr('home.text.locationNotSpecified') }}</span>
              <router-link :to="i.kind === 'EXAM' ? '/service/exams' : '/service/interviews'" class="tl-link">{{ tr('common.view') }}</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 26px 28px;
  margin-bottom: 16px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(120deg, #4f46e5 0%, #6366f1 45%, #14b8a6 120%);
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.22);
}
.hero::after {
  content: '';
  position: absolute;
  right: -60px;
  top: -80px;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}
.hero-text { flex: 1; min-width: 0; position: relative; z-index: 1; }
.hello { font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
.sub { margin-top: 6px; opacity: 0.85; font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; }
.dot { opacity: 0.6; }
.summary { margin-top: 14px; font-size: 14px; opacity: 0.95; }
.summary b { font-size: 18px; margin: 0 2px; }
.quick { display: flex; flex-direction: column; gap: 10px; width: 300px; position: relative; z-index: 1; }
.quick-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--xh-text);
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.quick-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15); }
.q-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.q-indigo .q-icon { background: linear-gradient(135deg, #6366f1, #4f46e5); }
.q-teal .q-icon { background: linear-gradient(135deg, #2dd4bf, #0d9488); }
.q-body { flex: 1; display: flex; flex-direction: column; }
.q-title { font-weight: 650; font-size: 15px; }
.q-desc { font-size: 12px; color: var(--xh-text-2); margin-top: 2px; }
.q-arrow { color: var(--xh-text-2); }

.todo-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.todo { display: flex; align-items: center; gap: 14px; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.todo:hover { border-color: var(--el-color-primary-light-5); transform: translateY(-1px); }
.todo.zero .stat-value { color: #94a3b8; }
.todo-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.two-col .page-card { margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.card-head .page-title { margin: 0; }
.more { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; color: var(--xh-text-2); text-decoration: none; }
.more:hover { color: var(--xh-primary); }
.list-card { min-height: 236px; }
.row {
  display: flex; align-items: center; gap: 10px; padding: 10px 6px; border-bottom: 1px dashed var(--xh-border);
  color: var(--xh-text); text-decoration: none; border-radius: 6px;
}
.row:last-child { border-bottom: none; }
.row:hover { background: #f7f8fc; }
.row:hover .row-title { color: var(--xh-primary); }
.row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { color: var(--xh-text-2); font-size: 12px; flex-shrink: 0; }
.pin { flex-shrink: 0; }
.ficon {
  width: 34px; height: 22px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.timeline { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
.tl-item { display: flex; gap: 14px; align-items: stretch; }
.tl-time { width: 56px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; padding-top: 8px; }
.tl-time b { font-size: 15px; }
.tl-time span { font-size: 12px; color: var(--xh-text-2); }
.tl-card { flex: 1; border-radius: 10px; padding: 10px 14px; border-left: 4px solid; }
.tl-title { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kind-chip { font-size: 11px; padding: 1px 8px; border-radius: 10px; color: #fff; font-weight: 600; }
.tl-meta { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--xh-text-2); }
.tl-meta span { display: inline-flex; align-items: center; gap: 4px; }
.tl-link { color: var(--xh-primary); text-decoration: none; font-weight: 500; }
.k-class .tl-card { background: var(--xh-kind-class-bg); border-color: var(--xh-kind-class); }
.k-class .kind-chip { background: var(--xh-kind-class); }
.k-vip .tl-card { background: var(--xh-kind-vip-bg); border-color: var(--xh-kind-vip); }
.k-vip .kind-chip { background: var(--xh-kind-vip); }
.k-other .tl-card { background: var(--xh-kind-other-bg); border-color: var(--xh-kind-other); }
.k-other .kind-chip { background: var(--xh-kind-other); }
.k-talk .tl-card { background: #ecfdf5; border-color: var(--xh-teal); }
.k-talk .kind-chip { background: var(--xh-teal); }
.tl-item.past { opacity: 0.55; }
.tl-item.now .tl-card { box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.25); }

@media (max-width: 900px) {
  .hero { flex-direction: column; align-items: stretch; }
  .quick { width: 100%; }
  .two-col { grid-template-columns: 1fr; gap: 0; }
}
@media (max-width: 767px) {
  .hero { padding: 20px 18px; border-radius: 14px; }
  .hello { font-size: 20px; }
  .todo-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .todo { padding: 12px; gap: 10px; }
  .todo-icon { width: 36px; height: 36px; }
  .stat-value { font-size: 20px; }
}
</style>
