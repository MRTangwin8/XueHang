<script setup lang="ts">
/**
 * 学员档案「成绩」区域：按「成绩与档案设置 → 考试类型」动态渲染。
 *   - 简单考试（只录一次、无分科）：同组并排显示一行（等级 / 分数 / 场次）
 *   - 多回或分科考试：每回一张卡片，分科成绩自动合计总分
 * <ExamFields v-model="form.exams" />
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { computeTotal, localName, useEdu, type ExamTypeDef } from '@/utils/edu'
import ExamSessionSelect from './ExamSessionSelect.vue'
import { emptyExamEntry, examFilled, examSessionLabel, type ExamEntry } from '../api'

const { t } = useI18n()
const edu = useEdu()
const model = defineModel<Record<string, ExamEntry[]>>({ required: true })

const isSimple = (e: ExamTypeDef) => e.maxAttempts <= 1 && !e.subjects.length

/** 显示的考试类型：未隐藏的 + 已隐藏但有数据的 + 配置里已不存在但有数据的 */
const types = computed<ExamTypeDef[]>(() => {
  const list = edu.examTypes(true).filter((e) => !e.hidden || (model.value[e.code] ?? []).some(examFilled))
  for (const code of Object.keys(model.value))
    if (!list.some((e) => e.code === code) && (model.value[code] ?? []).some(examFilled))
      list.push({ code, name: code, group: '', levels: [], scoreMax: null, scoreStep: 1, subjects: [], totalMode: 'sum', maxAttempts: 1, months: [], hidden: true })
  return list
})
const simpleGroups = computed(() => {
  const groups = new Map<string, ExamTypeDef[]>()
  for (const e of types.value.filter(isSimple)) groups.set(e.group, [...(groups.get(e.group) ?? []), e])
  return [...groups.entries()].map(([group, list]) => ({ group, list }))
})
const complexTypes = computed(() => types.value.filter((e) => !isSimple(e)))

// 简单考试始终有一条（空）记录，便于直接填写
watch(
  types,
  (list) => {
    for (const e of list) if (isSimple(e) && !model.value[e.code]?.length) model.value[e.code] = [emptyExamEntry()]
  },
  { immediate: true },
)

const entries = (code: string) => model.value[code] ?? []
function add(e: ExamTypeDef) {
  const list = (model.value[e.code] ??= [])
  if (list.length >= e.maxAttempts) return ElMessage.warning(t('grades.form.maxAttempts', { p1: localName(e.name), p2: e.maxAttempts }))
  list.push(emptyExamEntry())
}
const visibleSubjects = (e: ExamTypeDef, r?: ExamEntry) => e.subjects.filter((s) => !s.hidden || (r && r.scores[s.key] != null))
const autoTotal = (e: ExamTypeDef) => e.subjects.length > 0 && e.totalMode !== 'manual'
const total = (e: ExamTypeDef, r: ExamEntry) => computeTotal(e.subjects, r.scores, e.totalMode, e.scoreStep)

/** 高亮科目的最高分（如 EJU 日语），显示在成绩区顶部 */
const highlights = computed(() =>
  complexTypes.value.flatMap((e) =>
    e.subjects
      .filter((s) => s.highlight)
      .map((s) => {
        const rows = entries(e.code).filter((r) => r.scores[s.key] != null)
        if (!rows.length) return { key: `${e.code}.${s.key}`, label: `${localName(e.name)} · ${localName(s.name)}`, best: null as number | null, session: '', count: 0 }
        const best = rows.reduce((a, b) => (Number(b.scores[s.key]) > Number(a.scores[s.key]) ? b : a))
        return {
          key: `${e.code}.${s.key}`,
          label: `${localName(e.name)} · ${localName(s.name)}`,
          best: best.scores[s.key] ?? null,
          session: examSessionLabel(best.examDate) || t('students.messages.sessionNotSpecified'),
          count: rows.length,
        }
      }),
  ),
)
</script>

<template>
  <div class="exam-fields">
    <div v-if="highlights.length" class="hl-row">
      <div v-for="h in highlights" :key="h.key" class="hl">
        <span class="hl-label">{{ h.label }}</span>
        <template v-if="h.best != null">
          <b>{{ h.best }}</b>
          <span class="muted">{{ t('students.messages.bestOfSessions', { p1: h.session, p2: h.count }) }}</span>
        </template>
        <span v-else class="muted">{{ t('grades.form.highlightEmpty') }}</span>
      </div>
    </div>

    <!-- 简单考试：按分组并排 -->
    <template v-for="g in simpleGroups" :key="g.group">
      <div class="group-label">{{ localName(g.group) || t('grades.form.otherExams') }}</div>
      <div class="lang-grid">
        <div v-for="e in g.list" :key="e.code" class="lang-row">
          <div class="lang-label">{{ localName(e.name) }}</div>
          <template v-if="entries(e.code)[0]">
            <el-select v-if="e.levels.length" v-model="entries(e.code)[0].level" clearable :placeholder="t('students.messages.level')" class="lang-level">
              <el-option v-for="lv in e.levels" :key="lv" :value="lv" :label="localName(lv)" />
            </el-select>
            <el-input-number
              v-model="entries(e.code)[0].score"
              :min="0"
              :max="e.scoreMax ?? undefined"
              :step="e.scoreStep"
              :controls="false"
              :placeholder="e.scoreMax ? t('students.messages.scoreOutOf2', { p1: e.scoreMax }) : t('students.messages.score')"
              class="lang-score"
            />
            <ExamSessionSelect v-if="e.months.length" v-model="entries(e.code)[0].examDate" :months="e.months" class="lang-date" />
            <el-date-picker v-else v-model="entries(e.code)[0].examDate" type="month" value-format="YYYY-MM-DD"
              :placeholder="t('students.messages.examMonth')" class="lang-date" />
          </template>
        </div>
      </div>
    </template>

    <!-- 多回 / 分科考试 -->
    <div v-for="e in complexTypes" :key="e.code" class="complex">
      <div class="sub-head">
        <span>{{ localName(e.name) }}</span>
        <span v-if="e.maxAttempts > 1" class="muted">{{ t('students.messages.upToSessionsEntered', { p1: e.maxAttempts, p2: entries(e.code).length }) }}</span>
        <span class="spacer" />
        <el-button size="small" type="primary" plain icon="Plus" :disabled="entries(e.code).length >= e.maxAttempts" @click="add(e)">
          {{ e.maxAttempts > 1 ? t('students.messages.addSession') : t('grades.form.addRecord') }}
        </el-button>
      </div>
      <div v-if="!entries(e.code).length" class="muted empty-tip">{{ t('grades.form.noRecords') }}</div>
      <div v-for="(r, i) in entries(e.code)" :key="i" class="block-card">
        <div class="block-head">
          <strong v-if="e.maxAttempts > 1">{{ t('students.messages.session2', { p1: i + 1 }) }}</strong>
          <ExamSessionSelect v-if="e.months.length" v-model="r.examDate" :months="e.months" size="small" style="width: 150px" />
          <el-date-picker v-else v-model="r.examDate" type="month" value-format="YYYY-MM-DD" size="small" style="width: 150px"
            :placeholder="t('students.messages.examMonth')" />
          <el-select v-if="e.levels.length" v-model="r.level" clearable size="small" :placeholder="t('students.messages.level')" style="width: 110px">
            <el-option v-for="lv in e.levels" :key="lv" :value="lv" :label="localName(lv)" />
          </el-select>
          <span class="spacer" />
          <span v-if="autoTotal(e)" class="total">{{ t('students.messages.total') }} <b>{{ total(e, r) ?? '—' }}</b></span>
          <el-input-number v-else v-model="r.score" size="small" :min="0" :max="e.scoreMax ?? undefined" :step="e.scoreStep" :controls="false"
            :placeholder="t('students.messages.total')" style="width: 110px" />
          <el-button link type="danger" icon="Delete" @click="entries(e.code).splice(i, 1)" />
        </div>
        <div v-if="visibleSubjects(e, r).length" class="sub-grid">
          <label v-for="s in visibleSubjects(e, r)" :key="s.key" class="sub-cell">
            <span>{{ localName(s.name) }} <i class="muted">/ {{ s.max }}</i></span>
            <el-input-number v-model="r.scores[s.key]" :min="0" :max="s.max" :step="e.scoreStep" :controls="false" size="small" />
          </label>
        </div>
      </div>
    </div>
    <el-empty v-if="!types.length" :description="t('grades.form.noExamTypes')" :image-size="60" />
  </div>
</template>

<style scoped>
.group-label { font-weight: 600; font-size: 13px; color: var(--xh-text-2); margin: 4px 0 8px; }
.hl-row { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; padding: 10px 12px; background: var(--xh-primary-soft, #f3f4ff); border-radius: 10px; }
.hl { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.hl-label { font-weight: 600; }
.hl b { color: var(--xh-primary); font-size: 16px; }
.lang-grid { display: grid; gap: 10px; margin-bottom: 16px; }
.lang-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lang-label { width: 140px; font-weight: 600; color: var(--xh-text); }
.lang-level { width: 110px; }
.lang-score { width: 150px; }
.lang-date { width: 160px !important; }
.sub-head { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; font-weight: 600; flex-wrap: wrap; }
.sub-head .spacer, .block-head .spacer { flex: 1; }
.empty-tip { padding: 4px 0 12px; }
.block-card { border: 1px solid var(--xh-border); background: #fafbff; border-radius: 10px; padding: 12px 14px 4px; margin-bottom: 12px; }
.block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.total { color: var(--xh-text-2); }
.total b { color: var(--xh-primary); font-size: 16px; }
.sub-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 12px; padding-bottom: 10px; }
.sub-cell { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--xh-text-2); }
.sub-cell i { font-style: normal; }
.sub-cell :deep(.el-input-number) { width: 100%; }
@media (max-width: 767px) {
  .sub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lang-label { width: 100%; }
  .lang-level, .lang-score { width: calc(50% - 4px); }
  .lang-date { width: 100% !important; }
}
</style>
