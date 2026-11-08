<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 班级名单：从学员中选择 / 粘贴学号或姓名批量导入 / 移除 */
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fmtDate } from '@/utils/time'
import { useIsMobile } from '@/utils/format'
import StudentSelect from '@/components/StudentSelect.vue'
import DictTag from '@/components/DictTag.vue'
import { attendanceApi, type ImportResult } from '../api'

const { t: tr } = useI18n()

const props = defineProps<{ classGroupId: number | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const isMobile = useIsMobile()

type Roster = Awaited<ReturnType<typeof attendanceApi.roster>>
const roster = ref<Roster | null>(null)
const loading = ref(false)
const pick = ref<number[]>([])
const text = ref('')
const result = ref<ImportResult | null>(null)
const mode = ref<'pick' | 'import'>('pick')
const adding = ref(false)

async function load() {
  if (!props.classGroupId) return
  loading.value = true
  try {
    roster.value = await attendanceApi.roster(props.classGroupId)
  } finally {
    loading.value = false
  }
}
watch(
  () => props.classGroupId,
  (id) => {
    result.value = null
    pick.value = []
    text.value = ''
    if (id) load()
  },
  { immediate: true },
)

async function add() {
  const body = mode.value === 'pick' ? { studentIds: pick.value } : { importText: text.value }
  if (mode.value === 'pick' && !pick.value.length) return ElMessage.warning(tr('service.text.selectAStudent'))
  if (mode.value === 'import' && !text.value.trim()) return ElMessage.warning(tr('service.text.pasteStudentIdsOrNames'))
  adding.value = true
  try {
    result.value = await attendanceApi.addStudents(props.classGroupId!, body)
    ElMessage.success(tr('service.text.addedStudents', { v0: result.value.added }))
    pick.value = []
    if (!result.value.unmatched.length) text.value = ''
    else text.value = result.value.unmatched.map((u) => u.line).join('\n')
    await load()
    emit('changed')
  } finally {
    adding.value = false
  }
}
async function remove(s: { id: number; name: string }) {
  await ElMessageBox.confirm(tr('service.text.removeFromTheClassRosterExistingAttendanceRecordsWill', { v0: s.name }), tr(
    'service.text.confirmRemoval'), { type: 'warning' })
  await attendanceApi.removeStudent(props.classGroupId!, s.id)
  ElMessage.success(tr('service.text.removed'))
  await load()
  emit('changed')
}
</script>

<template>
  <el-drawer
    :model-value="!!classGroupId"
    :size="isMobile ? '100%' : '560px'"
    :title="tr('service.text.classRoster', { v0: roster?.classGroup.name ?? '' })"
    @close="emit('close')">
    <div class="add-box">
      <el-radio-group v-model="mode" size="small">
        <el-radio-button value="pick">{{ tr('service.text.selectExistingStudents') }}</el-radio-button>
        <el-radio-button value="import">{{ tr('service.text.bulkImport') }}</el-radio-button>
      </el-radio-group>
      <div v-if="mode === 'pick'" class="add-row">
        <StudentSelect v-model="pick" multiple status="ENROLLED" :placeholder="tr('service.text.searchByNameIdMultipleSelectionsAllowed')" style="flex: 1" />
      </div>
      <div v-else class="add-row col">
        <el-input v-model="text" type="textarea" :rows="5" :placeholder="tr('service.text.pasteOneStudentIdOrNamePerLineE')" />
        <div class="muted">{{ tr('service.text.matchedByStudentIdFirstThenByNameUse') }}</div>
      </div>
      <el-button type="primary" icon="Plus" :loading="adding" @click="add">{{ tr('service.text.addToClass') }}</el-button>
      <div v-if="result" class="result">
        <div>
          {{ tr('service.text.matchedStudentsNewlyAdded', { matched: result.matched.length, added: result.added }) }}
          <span v-if="result.existed">{{ tr('service.text.alreadyInClass', { n: result.existed }) }}</span>
        </div>
        <div v-if="result.unmatched.length" class="text-danger">
          {{ tr('service.text.unmatchedEntries', { n: result.unmatched.length }) }}
          <div v-for="u in result.unmatched" :key="u.line">· {{ u.line }}（{{ u.reason }}）</div>
        </div>
      </div>
    </div>
    <h3 class="page-title" style="margin-top: 18px">{{ tr('service.text.currentRosterStudents', { n: roster?.items.length ?? 0 }) }}</h3>
    <el-table v-loading="loading" :data="roster?.items ?? []" size="small">
      <el-table-column :label="tr('auth.studentNo')" prop="studentNo" width="110" />
      <el-table-column :label="tr('profile.name')" prop="name" min-width="90" />
      <el-table-column :label="tr('common.status')" width="80">
        <template #default="{ row }"><DictTag dict="studentStatuses" :value="row.status" /></template>
      </el-table-column>
      <el-table-column v-if="!isMobile" :label="tr('service.text.joined')" width="100">
        <template #default="{ row }">{{ fmtDate(row.joinedAt) }}</template>
      </el-table-column>
      <el-table-column label="" width="60">
        <template #default="{ row }"><el-button link type="danger" @click="remove(row as any)">{{ tr('service.text.remove') }}</el-button></template>
      </el-table-column>
      <template #empty><el-empty :description="tr('service.text.theRosterIsEmpty')" :image-size="60" /></template>
    </el-table>
  </el-drawer>
</template>

<style scoped>
.add-box { display: flex; flex-direction: column; gap: 10px; padding: 14px; background: #f7f8fc; border-radius: 10px; }
.add-row { display: flex; gap: 8px; }
.add-row.col { flex-direction: column; }
.add-box > .el-button { align-self: flex-start; }
.result { font-size: 13px; line-height: 1.7; }
</style>
