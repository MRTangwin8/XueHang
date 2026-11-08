<script setup lang="ts">
/** 学生端：我的成绩（只显示已发布的考试） */
import StudentGrades from '../components/StudentGrades.vue'
</script>

<template>
  <div class="page">
    <div class="page-card">
      <StudentGrades portal />
    </div>
  </div>
</template>
