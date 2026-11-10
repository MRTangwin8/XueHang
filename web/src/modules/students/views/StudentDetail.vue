<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 学员详情：档案 / 成绩 / 合格信息 / 订单（有权限才显示）/ 班课与 VIP */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DictTag from '@/components/DictTag.vue'
import DictSelect from '@/components/DictSelect.vue'
import { useAuth } from '@/stores/auth'
import { useDict } from '@/stores/dict'
import { money, hours, useIsMobile, useDialogWidth } from '@/utils/format'
import { fmtDate, today, toApi } from '@/utils/time'
import OrderCreateDialog from '@/modules/orders/components/OrderCreateDialog.vue'
import OrderDrawer from '@/modules/orders/components/OrderDrawer.vue'
import StudentForm from '../components/StudentForm.vue'
import StudentGrades from '@/modules/grades/components/StudentGrades.vue'
import MyTimetable from '@/modules/schedule/views/portal/MyTimetable.vue'
import { computeTotal, localName, useEdu, type ExamTypeDef } from '@/utils/edu'
import { examSessionLabel, studentFormFromDetail, studentPayload, studentsApi, type Exam, type StudentDetail, type StudentFormModel } from '../api'

const { t } = useI18n()
const edu = useEdu()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()
const smallDlg = useDialogWidth('420px')

const s = ref<StudentDetail | null>(null)
const loading = ref(false)
const tab = ref('profile')
const id = computed(() => Number(route.params.id))

async function load() {
  if (!id.value) return
  loading.value = true
  try {
    s.value = await studentsApi.get(id.value)
  } finally {
    loading.value = false
  }
}
watch(id, load, { immediate: true })

/** 成绩按考试类型分组：简单考试一张表，多回 / 分科考试各一张表 */
const examGroups = computed(() => {
  const all = s.value?.exams ?? []
  const codes = [...new Set(all.map((e) => e.examType))]
  const defs = codes.map((c): ExamTypeDef => edu.examType(c) ?? { code: c, name: c, group: '', levels: [], scoreMax: null, scoreStep: 1, subjects: [],
    totalMode: 'sum', maxAttempts: 1, months: [], hidden: true })
  const order = (c: string) => { const i = edu.examTypes(true).findIndex((e) => e.code === c); return i < 0 ? 999 : i }
  defs.sort((a, b) => order(a.code) - order(b.code))
  const simple = defs.filter((d) => d.maxAttempts <= 1 && !d.subjects.length)
  return {
    simple: all.filter((e) => simple.some((d) => d.code === e.examType)).sort((a, b) => order(a.examType) - order(b.examType)),
    complex: defs.filter((d) => !simple.includes(d)).map((d) => ({
      def: d,
      rows: all.filter((e) => e.examType === d.code).sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0)),
      subjects: d.subjects.filter((x) => !x.hidden || all.some((e) => e.examType === d.code && e.scores?.[x.key] != null)),
    })),
  }
})
const examName = (c: string) => localName(edu.examType(c)?.name ?? c)
const subScore = (row: Exam, key: string) => row.scores?.[key] ?? ''
const canOrder = computed(() => !!s.value && !s.value.deletedAt && auth.can(['student.enroll', 'order.pay']) && (s.value.access.bySales ||
  s.value.access.byAll || auth.can('order.all')))

// ---------- 编辑档案 ----------
const editDlg = ref(false)
const editForm = ref<StudentFormModel | null>(null)
const editRef = ref<InstanceType<typeof StudentForm>>()
const saving = ref(false)
function openEdit() {
  if (!s.value) return
  editForm.value = studentFormFromDetail(s.value)
  editDlg.value = true
}
async function saveEdit() {
  if (!s.value || !editForm.value || !(await editRef.value?.validate())) return
  saving.value = true
  try {
    await studentsApi.update(s.value.id, studentPayload(editForm.value))
    ElMessage.success(t('students.messages.recordSaved'))
    editDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ---------- 状态 ----------
const statusDlg = ref(false)
const st = reactive({ status: 'ENROLLED', leftAt: today() as string | null })
function openStatus() {
  if (!s.value) return
  st.status = s.value.status
  st.leftAt = s.value.leftAt ? fmtDate(s.value.leftAt) : today()
  statusDlg.value = true
}
async function saveStatus() {
  if (!s.value) return
  await studentsApi.setStatus(s.value.id, st.status, st.leftAt ? toApi(st.leftAt) : null)
  ElMessage.success(t('students.messages.statusUpdated'))
  statusDlg.value = false
  load()
}

async function resetPassword() {
  if (!s.value) return
  await ElMessageBox.confirm(t('students.messages.theOldPasswordWillStopWorkingImmediately'), t('students.messages.resetPassword'), { type: 'warning' })
  const r = await studentsApi.resetPassword(s.value.id)
  await ElMessageBox.alert(t('students.messages.studentIdNewPasswordShownOnlyOnce', { p1: r.studentNo, p2: r.password }), t('profile.newPassword'), {
    dangerouslyUseHTMLString: true,
  })
}

async function remove() {
  if (!s.value) return
  await ElMessageBox.confirm(t('students.messages.deleteStudentYouCanRestoreThemFrom', { p1: s.value.name }), t('students.messages.deleteStudent'), {
    type: 'warning' })
  await studentsApi.remove(s.value.id)
  ElMessage.success(t('common.deleted'))
  router.replace('/students/all')
}
async function restore() {
  if (!s.value) return
  await studentsApi.restore(s.value.id)
  ElMessage.success(t('students.messages.restored'))
  load()
}

// ---------- 订单 ----------
const orderDlg = ref(false)
const drawer = ref(false)
const drawerId = ref<number | null>(null)
function openOrderDrawer(oid: number) {
  drawerId.value = oid
  drawer.value = true
}
const onOrderRow = (r: { id: number }) => openOrderDrawer(r.id)
const teacherNames = (p: unknown) => (p as StudentDetail['vipPackages'][number]).teachers.map((t) => t.teacher.name).join('、')
function onMore(cmd: string) {
  if (cmd === 'status') openStatus()
  else if (cmd === 'password') resetPassword()
  else if (cmd === 'delete') remove()
}
</script>

<template>
  <div v-loading="loading" class="page">
    <template v-if="s">
      <!-- 头部 -->
      <div class="page-card head-card">
        <div class="avatar">{{ s.name.slice(-1) }}</div>
        <div class="head-main">
          <div class="head-name">
            <span>{{ s.name }}</span>
            <span v-if="s.nameAlt" class="muted alt">{{ s.nameAlt }}</span>
            <DictTag dict="studentStatuses" :value="s.status" size="default" />
            <el-tag v-if="s.deletedAt" type="danger" disable-transitions>{{ t('common.deleted') }}</el-tag>
          </div>
          <div class="head-meta">
            <span>{{ t('auth.studentNo') }}<b>{{ s.studentNo }}</b></span>
            <span>{{ s.campus.name }}</span>
            <span v-if="s.languageSchool && edu.show('languageSchool')">{{ s.languageSchool }}</span>
            <span v-if="s.subjectCategory">{{ dict.label('subjectCategories', s.subjectCategory) }}</span>
            <span v-if="s.packageName">
              {{ s.packageName }}
              <el-tag v-if="s.classMode" size="small" effect="plain" disable-transitions>{{ dict.label('classModes', s.classMode) }}</el-tag>
            </span>
          </div>
          <div class="head-meta muted">
            {{ t('students.messages.assignedContractSales', { p1: s.mainTeacher?.name ?? '—', p2: s.contractTeacher?.name ?? '—', p3: s.sales?.name ?? '—' }) }}
          </div>
        </div>
        <div class="head-actions">
          <el-button v-if="s.deletedAt && s.access.canDelete" type="warning" @click="restore">{{ t('students.messages.restoreStudent2') }}</el-button>
          <template v-else>
            <el-button v-if="s.access.canEdit" type="primary" icon="Edit" @click="openEdit">{{ t('students.messages.editRecord') }}</el-button>
            <el-button v-if="canOrder" icon="ShoppingCart" @click="orderDlg = true">{{ t('students.messages.courseEnrollmentPayment') }}</el-button>
            <el-button v-if="s.access.byTeacher" icon="ChatDotRound" @click="router.push(`/service/interviews?studentId=${s.id}`)">
              {{ t('students.messages.interview') }}
            </el-button>
            <el-dropdown v-if="s.access.canManage || s.access.canDelete" trigger="click" @command="onMore">
              <el-button icon="MoreFilled">{{ t('common.more') }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="s.access.canManage" command="status">{{ t('students.messages.changeStatus') }}</el-dropdown-item>
                  <el-dropdown-item v-if="s.access.canManage" command="password">{{ t('students.messages.resetPortalPassword') }}</el-dropdown-item>
                  <el-dropdown-item v-if="s.access.canDelete" command="delete" divided>
                    <span class="text-danger">
                      {{ t('students.messages.deleteStudent') }}
                    </span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </div>
      </div>
      <div class="page-card">
        <el-tabs v-model="tab">
          <!-- 档案 -->
          <el-tab-pane :label="t('students.messages.record')" name="profile">
            <h3 class="page-title">{{ t('students.messages.basicInformation') }}</h3>
            <el-descriptions :column="isMobile ? 1 : 3" border size="small">
              <el-descriptions-item :label="t('profile.name')">{{ s.name }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('nameAlt')" :label="edu.label('nameAlt')">{{ s.nameAlt }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('gender')" :label="edu.label('gender')">{{ dict.label('genders', s.gender) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('birthday')" :label="edu.label('birthday')">{{ fmtDate(s.birthday) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('phone')" :label="edu.label('phone')">{{ s.phone }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('phoneCn')" :label="edu.label('phoneCn')">{{ s.phoneCn }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('wechat')" :label="edu.label('wechat')">{{ s.wechat }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('email')" :label="edu.label('email')">{{ s.email }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('qq')" :label="edu.label('qq')">{{ s.qq }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('address')" :label="edu.label('address')" :span="isMobile ? 1 : 3">{{ s.address }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('emergency')" :label="edu.label('emergency')">
                {{ s.emergencyName }}
                <template v-if="s.emergencyRelation">（{{ s.emergencyRelation }}）</template>
              </el-descriptions-item>
              <el-descriptions-item v-if="edu.show('emergency')" :label="t('students.messages.emergencyPhone')">{{ s.emergencyPhone }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('visaStatus')" :label="edu.label('visaStatus')">{{ dict.label('visaStatuses', s.visaStatus) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('arrivedAt')" :label="edu.label('arrivedAt')">{{ fmtDate(s.arrivedAt) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('enrollTerm')" :label="edu.label('enrollTerm')">{{ s.enrollTerm }}</el-descriptions-item>
              <el-descriptions-item :label="t('students.messages.enrollmentDate')">{{ fmtDate(s.enrolledAt) }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.campus')">{{ s.campus.name }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('channel')" :label="edu.label('channel')">{{ s.channel?.name }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('organization')" :label="edu.label('organization')">{{ s.organization?.name }}</el-descriptions-item>
              <el-descriptions-item v-if="s.leftAt" :label="t('students.messages.leavingDate')">{{ fmtDate(s.leftAt) }}</el-descriptions-item>
              <el-descriptions-item v-if="s.customer" :label="t('students.messages.sourceCustomer')">{{ s.customer.name }}</el-descriptions-item>
            </el-descriptions>
            <h3 class="page-title sec">{{ t('students.messages.educationInformation') }}</h3>
            <el-descriptions :column="isMobile ? 1 : 3" border size="small">
              <el-descriptions-item v-if="edu.show('education')" :label="edu.label('education')">{{ dict.label('educations', s.education) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('graduatedSchool')" :label="edu.label('graduatedSchool')">{{ s.graduatedSchool }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('graduatedMajor')" :label="edu.label('graduatedMajor')">{{ s.graduatedMajor }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('graduatedAt')" :label="edu.label('graduatedAt')">{{ fmtDate(s.graduatedAt) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('languageSchool')" :label="edu.label('languageSchool')">{{ s.languageSchool }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('subjectCategory')" :label="edu.label('subjectCategory')">
                {{ dict.label('subjectCategories', s.subjectCategory) }}
              </el-descriptions-item>
              <el-descriptions-item v-if="edu.show('targetUniversity')" :label="edu.label('targetUniversity')">{{ s.targetUniversity }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('targetMajor')" :label="edu.label('targetMajor')">{{ s.targetMajor }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('targetDegree')" :label="edu.label('targetDegree')">{{ dict.label('targetDegrees', s.targetDegree) }}</el-descriptions-item>
              <el-descriptions-item v-if="edu.show('researchTheme')" :label="edu.label('researchTheme')" :span="isMobile ? 1 : 3">{{ s.researchTheme }}</el-descriptions-item>
              <el-descriptions-item :label="t('students.messages.assignedTeacher')">{{ s.mainTeacher?.name }}</el-descriptions-item>
              <el-descriptions-item :label="t('students.messages.contractTeacher')">{{ s.contractTeacher?.name }}</el-descriptions-item>
              <el-descriptions-item :label="t('students.messages.salesAdvisor')">{{ s.sales?.name }}</el-descriptions-item>
              <el-descriptions-item v-if="s.note" :label="t('common.remark')" :span="isMobile ? 1 : 3">{{ s.note }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <!-- 考试 / 证书成绩（档案） -->
          <el-tab-pane v-if="edu.show('exams')" :label="edu.label('exams')" name="exams">
            <template v-if="examGroups.simple.length || examGroups.complex.length">
              <el-table v-if="examGroups.simple.length" :data="examGroups.simple" size="small">
                <el-table-column :label="t('students.messages.exam')" min-width="140">
                  <template #default="{ row }">{{ examName(row.examType) }}</template>
                </el-table-column>
                <el-table-column :label="t('students.messages.level')" width="90"><template #default="{ row }">{{ localName(row.level) }}</template></el-table-column>
                <el-table-column :label="t('students.messages.score')" width="90"><template #default="{ row }">{{ row.score ?? '' }}</template></el-table-column>
                <el-table-column :label="t('students.messages.examDate')" min-width="110">
                  <template #default="{ row }">{{ examSessionLabel(fmtDate(row.examDate)) }}</template>
                </el-table-column>
              </el-table>
              <template v-for="g in examGroups.complex" :key="g.def.code">
                <h3 class="page-title sec">{{ localName(g.def.name) }}</h3>
                <el-table :data="g.rows" size="small">
                  <el-table-column v-if="g.def.maxAttempts > 1" :label="t('students.messages.session')" width="70" fixed>
                    <template #default="{ row }">{{ t('students.messages.session2', { p1: row.attempt ?? '-' }) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('students.messages.examSession')" width="110">
                    <template #default="{ row }">{{ examSessionLabel(fmtDate(row.examDate)) }}</template>
                  </el-table-column>
                  <el-table-column v-if="g.def.levels.length" :label="t('students.messages.level')" width="80">
                    <template #default="{ row }">{{ localName(row.level) }}</template>
                  </el-table-column>
                  <el-table-column v-for="k in g.subjects" :key="k.key" :label="localName(k.name)" min-width="70" align="center">
                    <template #default="{ row }: any">{{ subScore(row, k.key) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('students.messages.total')" width="80" align="center">
                    <template #default="{ row }: any"><b>{{ row.score ?? computeTotal(g.def.subjects, row.scores ?? {}, g.def.totalMode, g.def.scoreStep) ?? '' }}</b></template>
                  </el-table-column>
                </el-table>
              </template>
            </template>
            <el-empty v-else :description="t('grades.form.noRecords')" :image-size="60" />
          </el-tab-pane>
          <!-- 校内考试成绩（成绩管理） -->
          <el-tab-pane :label="t('grades.student.tab')" name="grades" lazy>
            <StudentGrades :student-id="s.id" />
          </el-tab-pane>
          <!-- 合格信息 -->
          <el-tab-pane v-if="edu.show('admissions')" :label="edu.label('admissions')" name="admissions">
            <div v-if="s.admissions.length" class="adm-grid">
              <div v-for="(a, i) in s.admissions" :key="a.id ?? i" class="adm-card">
                <div class="muted">{{ t('students.messages.admission', { p1: i + 1 }) }}</div>
                <div class="adm-uni">{{ a.university }}</div>
                <div class="adm-sub">{{ [a.faculty, a.department, a.major].filter(Boolean).join(' · ') || '—' }}</div>
              </div>
            </div>
            <el-empty v-else :description="t('students.messages.noAdmissions')" />
          </el-tab-pane>
          <!-- 订单 -->
          <el-tab-pane v-if="s.access.canViewOrders" :label="t('students.messages.orders')" name="orders">
            <div class="toolbar">
              <span class="spacer" />
              <el-button v-if="canOrder" type="primary" icon="Plus" @click="orderDlg = true">{{ t('students.messages.courseEnrollmentPayment') }}</el-button>
            </div>
            <el-table :data="s.orders ?? []" size="small" @row-click="onOrderRow" class="click-rows">
              <el-table-column prop="orderNo" :label="t('students.messages.orderNumber')" width="140" />
              <el-table-column :label="t('students.messages.tuitionPackage')" min-width="160">
                <template #default="{ row }">
                  {{ row.package?.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.classAssignment')" width="90">
                <template #default="{ row }">
                  {{ dict.label('classModes', row.classMode) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.amountDue')" width="110" align="right">
                <template #default="{ row }">
                  {{ money(row.payableAmount, row.currency) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.paid2')" width="110" align="right">
                <template #default="{ row }">
                  {{ money(row.paidAmount, row.currency) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.status')" width="90">
                <template #default="{ row }">
                  <DictTag dict="orderStatuses" :value="row.status" />
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.contractDate')" width="100">
                <template #default="{ row }">
                  {{ fmtDate(row.signedAt) }}
                </template>
              </el-table-column>
              <template #empty><el-empty :description="t('students.messages.noOrders')" :image-size="60" /></template>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="t('schedule.studentTimetableTab')" name="timetable" lazy>
            <MyTimetable :student-id="s.id" :student-name="s.name" :student-no="s.studentNo" />
          </el-tab-pane>
          <!-- 班课与 VIP -->
          <el-tab-pane :label="t('students.messages.groupClassesVip')" name="classes">
            <h3 class="page-title">{{ t('students.messages.groupClasses') }}</h3>
            <el-table :data="s.classGroups" size="small">
              <el-table-column prop="name" :label="t('students.messages.class')" min-width="160" />
              <el-table-column prop="subject" :label="t('students.messages.subject')" width="120" />
              <el-table-column :label="t('students.messages.classTeacher')" width="100">
                <template #default="{ row }">
                  {{ row.teacher?.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.dateJoined')" width="100">
                <template #default="{ row }">
                  {{ fmtDate(row.joinedAt) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.status')" width="80">
                <template #default="{ row }">
                  <DictTag dict="vipStatuses" :value="row.status" />
                </template>
              </el-table-column>
              <template #empty><el-empty :description="t('students.messages.notEnrolledInGroupClasses')" :image-size="60" /></template>
            </el-table>
            <h3 class="page-title sec">{{ t('students.messages.vipHours') }}</h3>
            <div class="stat-grid">
              <div class="stat">
                <div class="stat-label">
                  {{ t('students.messages.totalHours') }}
                </div>
                <div class="stat-value">
                  {{ hours(s.vipSummary.total) }}
                </div>
              </div>
              <div class="stat">
                <div class="stat-label">
                  {{ t('students.messages.confirmed') }}
                </div>
                <div class="stat-value">
                  {{ hours(s.vipSummary.used) }}
                </div>
              </div>
              <div class="stat">
                <div class="stat-label">
                  {{ t('students.messages.pendingConfirmation') }}
                </div>
                <div class="stat-value" style="color: var(--xh-kind-vip)">
                  {{ hours(s.vipSummary.pending) }}
                </div>
              </div>
              <div class="stat">
                <div class="stat-label">
                  {{ t('students.messages.remaining') }}
                </div>
                <div class="stat-value" style="color: var(--xh-primary)">
                  {{ hours(s.vipSummary.remaining) }}
                </div>
              </div>
            </div>
            <el-table :data="s.vipPackages" size="small">
              <el-table-column prop="name" :label="t('students.messages.hourPackage')" min-width="160" />
              <el-table-column prop="subject" :label="t('students.messages.content')" min-width="120" />
              <el-table-column :label="t('students.messages.teacher')" width="120">
                <template #default="{ row }">
                  {{ teacherNames(row) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('students.messages.totalConfirmedPending')" width="160">
                <template #default="{ row }">
                  {{ hours(row.totalHours) }}
                  /
                  {{ hours(row.usedHours) }}
                  /
                  {{ hours(row.pendingHours) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.status')" width="80">
                <template #default="{ row }">
                  <DictTag dict="vipStatuses" :value="row.status" />
                </template>
              </el-table-column>
              <template #empty><el-empty :description="t('students.messages.noVipHourPackages')" :image-size="60" /></template>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
      <!-- 编辑档案 -->
      <el-dialog
        v-model="editDlg"
        :title="t('students.messages.editStudentRecord')"
        :width="isMobile ? '100%' : '960px'"
        :fullscreen="isMobile"
        top="4vh"
        :close-on-click-modal="false"
        destroy-on-close
      >
        <StudentForm v-if="editForm" ref="editRef" v-model="editForm" />
        <template #footer>
          <el-button @click="editDlg = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="saveEdit">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
      <!-- 变更状态 -->
      <el-dialog v-model="statusDlg" :title="t('students.messages.changeStudentStatus')" :width="smallDlg">
        <el-form label-width="80px">
          <el-form-item :label="t('common.status')"><DictSelect v-model="st.status" dict="studentStatuses" radio /></el-form-item>
          <el-form-item v-if="st.status === 'LEFT' || st.status === 'GRADUATED'" :label="t('students.messages.leavingDate')">
            <el-date-picker v-model="st.leftAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="statusDlg = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="saveStatus">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
      <OrderCreateDialog v-model="orderDlg" :student="s" @created="load" />
      <OrderDrawer v-model="drawer" :order-id="drawerId" @changed="load" />
    </template>
    <el-empty v-else-if="!loading" :description="t('students.messages.studentNotFoundOrAccessDenied')" />
  </div>
</template>

<style scoped>
.head-card { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--xh-primary), var(--xh-teal));
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  flex: none;
}
.head-main { flex: 1; min-width: 220px; display: grid; gap: 6px; }
.head-name { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; flex-wrap: wrap; }
.head-name .alt { font-size: 13px; font-weight: 400; }
.head-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; align-items: center; }
.head-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.head-actions .el-button { margin-left: 0; }
.sec { margin-top: 20px; }
.adm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.adm-card {
  border: 1px solid var(--xh-border);
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, var(--xh-primary-soft), #fff 70%);
  display: grid;
  gap: 4px;
}
.adm-uni { font-size: 17px; font-weight: 700; color: var(--xh-primary); }
.adm-sub { font-size: 13px; }
.click-rows :deep(.el-table__row) { cursor: pointer; }
@media (max-width: 767px) {
  .head-actions { width: 100%; }
}
</style>
