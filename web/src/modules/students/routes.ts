import type { RouteRecordRaw } from 'vue-router'

/** 学员管理：报名 / 我的在籍学员 / 全部在籍学员 / 学员详情；教师中心：我担当的学生 */
export default [
  { path: 'students/enroll', component: () => import('./views/Enroll.vue'), meta: { title: "students.messages.newStudentEnrollment", group:
    'students', perm: 'student.enroll', order: 1 } },
  {
    path: 'students/mine',
    component: () => import('./views/MyStudents.vue'),
    meta: { title: "students.messages.myEnrolledStudents", group: 'students', perm: ['student.view', 'teacher.students'], order: 2 },
  },
  { path: 'students/all', component: () => import('./views/AllStudents.vue'), meta: { title: "students.messages.allEnrolledStudents", group:
    'students', perm: 'student.all', order: 3 } },
  { path: 'students/:id(\\d+)', component: () => import('./views/StudentDetail.vue'), meta: { title: "students.messages.studentDetails", group:
    'students', hidden: true } },
  {
    path: 'teacher/students',
    component: () => import('./views/TeacherStudents.vue'),
    meta: { title: "students.messages.myAssignedStudents", group: 'teacher', perm: 'teacher.students', order: 3 },
  },
] satisfies RouteRecordRaw[]
