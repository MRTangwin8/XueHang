<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 教室管理 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CampusSelect from '@/components/CampusSelect.vue'
import DictSelect from '@/components/DictSelect.vue'
import { useDict } from '@/stores/dict'
import { useAuth } from '@/stores/auth'
import { useDialogWidth, useIsMobile } from '@/utils/format'
import { scheduleApi, type Room } from '../api'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const dict = useDict()
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('520px')

const q = reactive({ campusId: route.query.campusId ? Number(route.query.campusId) : null as number | null, inactive: route.query.inactive === '1' })
const list = ref<Room[]>([])
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    list.value = await scheduleApi.rooms(q.campusId, q.inactive)
  } finally {
    loading.value = false
  }
}
watch(q, () => {
  router.replace({ query: { campusId: q.campusId ?? undefined, inactive: q.inactive ? '1' : undefined } })
  load()
})
onMounted(load)
const grouped = computed(() => {
  const m = new Map<string, Room[]>()
  for (const r of list.value) {
    const k = `${r.campus?.name ?? ''} · ${r.building || t('schedule.other')}`
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return [...m.entries()]
})

const visible = ref(false)
const editId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({ campusId: null as number | null, name: '', building: '', capacity: 1, kind: 'CLASS', allowVip: true, sort: 50, note: '' })
function openEdit(r?: Room) {
  editId.value = r?.id ?? null
  Object.assign(form, r
    ? { campusId: r.campusId, name: r.name, building: r.building ?? '', capacity: r.capacity, kind: r.kind, allowVip: r.allowVip, sort: r.sort,
      note: r.note ?? '' }
    : { campusId: q.campusId ?? auth.me?.campusId ?? null, name: '', building: '', capacity: 1, kind: 'CLASS', allowVip: true, sort: 50, note: '' })
  visible.value = true
}
async function save() {
  if (!form.campusId) return ElMessage.warning(t('schedule.pleaseSelectACampus'))
  if (!form.name.trim()) return ElMessage.warning(t('schedule.pleaseEnterTheRoomName'))
  saving.value = true
  try {
    await scheduleApi.saveRoom({ ...form, name: form.name.trim(), building: form.building.trim() || null, note: form.note.trim() ||
      null } as Partial<Room>, editId.value ?? undefined)
    ElMessage.success(t('common.saved'))
    visible.value = false
    load()
  } finally {
    saving.value = false
  }
}
async function toggle(r: Room) {
  if (r.active) {
    try {
      await ElMessageBox.confirm(t('schedule.disableNewBookingsWillBeBlockedPast', { p0: r.name }), t('schedule.disableRoom'), { type: 'warning' })
    } catch {
      return
    }
    await scheduleApi.disableRoom(r.id)
  } else await scheduleApi.restoreRoom(r.id)
  ElMessage.success(t('schedule.updated'))
  load()
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ t('schedule.menu.rooms') }}</h2>
      <span class="spacer" />
      <el-button type="primary" icon="Plus" @click="openEdit()">{{ t('schedule.newRoom') }}</el-button>
    </div>
    <div class="page-card">
      <div class="toolbar">
        <CampusSelect v-model="q.campusId" :placeholder="t('common.allCampuses')" />
        <el-checkbox v-model="q.inactive">{{ t('schedule.showDisabledRooms') }}</el-checkbox>
      </div>
      <div v-loading="loading">
        <div v-for="[g, rooms] in grouped" :key="g" class="grp">
          <h3 class="page-title">{{ g }}</h3>
          <el-table :data="rooms" size="small">
            <el-table-column :label="t('schedule.room')" min-width="120"><template #default="{ row }: any"><b>{{ row.name }}</b></template></el-table-column>
            <el-table-column :label="t('schedule.type')" width="100">
            <template #default="{ row }: any">{{ dict.label('roomKinds', row.kind) }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.capacity')" width="70" align="center" prop="capacity" />
            <el-table-column v-if="!isMobile" :label="t('schedule.vipBookingAllowed')" width="90" align="center">
            <template #default="{ row }: any">{{ row.allowVip ? t('common.yes') : t('common.no') }}</template>
            </el-table-column>
            <el-table-column v-if="!isMobile" :label="t('schedule.sortOrder')" width="70" align="center" prop="sort" />
            <el-table-column v-if="!isMobile" :label="t('common.remark')" min-width="120" prop="note" />
            <el-table-column :label="t('common.status')" width="80">
              <template #default="{ row }: any">
              <el-tag :type="row.active ? 'success' : 'info'" size="small" disable-transitions>{{
                row.active ? t('schedule.enable') : t('schedule.disable')
              }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.operation')" width="110" fixed="right">
              <template #default="{ row }: any">
                <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
                <el-button link :type="row.active ? 'danger' : 'primary'" @click="toggle(row)">{{
                  row.active ? t('schedule.disable') : t('schedule.enable')
                }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-if="!list.length && !loading" :description="t('schedule.noRooms')" />
      </div>
    </div>

    <el-dialog
      v-model="visible"
      :title="editId ? t('schedule.editRoom') : t('schedule.newRoom')"
      :width="dlgWidth"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="84px" :disabled="saving">
        <el-form-item :label="t('common.campus')" required><CampusSelect
          v-model="form.campusId"
          :clearable="false"
          :placeholder="t('schedule.selectCampus')"
          style="width: 100%"
        /></el-form-item>
        <el-form-item :label="t('schedule.name')" required><el-input v-model="form.name" maxlength="50" :placeholder="t('schedule.eG4f401')" /></el-form-item>
        <el-form-item :label="t('schedule.building')">
        <el-input v-model="form.building" maxlength="30" :placeholder="t('schedule.usedToGroupRoomBookingsEG')" />
        </el-form-item>
        <el-form-item :label="t('schedule.type')"><DictSelect v-model="form.kind" dict="roomKinds" :clearable="false" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('schedule.capacity')"><el-input-number v-model="form.capacity" :min="1" :max="1000" /></el-form-item>
        <el-form-item :label="t('schedule.vipBookingAllowed')"><el-switch v-model="form.allowVip" /></el-form-item>
        <el-form-item :label="t('schedule.sortOrder')">
        <el-input-number v-model="form.sort" :min="0" :max="9999" />
        <span class="muted" style="margin-left: 8px">{{ t('schedule.lowerNumbersAppearFirst') }}</span>
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.grp + .grp { margin-top: 20px; }
</style>
