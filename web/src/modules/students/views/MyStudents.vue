<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 我的在籍学员：「我销售的」/「我担当的」两个标签，只显示有权限的标签；当前标签存于 URL ?tab= */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import StudentTable from '../components/StudentTable.vue'

const { t } = useI18n()

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const tabs = computed(() =>
  [
    { name: 'sales', label: t('students.messages.mySales'), show: auth.can('student.view') },
    { name: 'teacher', label: t('students.messages.myAssignedStudents2'), show: auth.can('teacher.students') },
  ].filter((t) => t.show),
)
const active = computed<'sales' | 'teacher'>(() => {
  const t = route.query.tab
  return (tabs.value.find((x) => x.name === t)?.name ?? tabs.value[0]?.name ?? 'sales') as 'sales' | 'teacher'
})
function switchTab(name: string | number) {
  if (name !== active.value) router.replace({ query: { tab: String(name) } })
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <el-tabs :model-value="active" @tab-change="switchTab">
        <el-tab-pane v-for="t in tabs" :key="t.name" :name="t.name" :label="t.label" />
      </el-tabs>
      <StudentTable :key="active" :scope="active" />
    </div>
  </div>
</template>
