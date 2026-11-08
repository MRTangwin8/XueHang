/**
 * 权限点目录。角色编辑器从 GET /api/auth/permissions 读取此列表。
 * 新增权限点：在对应分组追加即可（code 全局唯一）。"*" = 全部权限。
 */
export interface PermDef {
  code: string
  name: string
}
export interface PermGroup {
  key: string
  group: string
  items: PermDef[]
}

export const PERMISSIONS: PermGroup[] = [
  {
    key: 'home',
    group: '信息中心 / 教师中心',
    items: [
      { code: 'daily.write', name: '写日报' },
      { code: 'crm.daily.all', name: '全员日报（查看所有人的日报）' },
      { code: 'wage.claim', name: '工资申报' },
      { code: 'teacher.students', name: '我担当的学生' },
    ],
  },
  {
    key: 'crm',
    group: '客户管理',
    items: [
      { code: 'crm.customer.view', name: '我的客户' },
      { code: 'crm.customer.all', name: '全部客户（查看全部）' },
      { code: 'crm.pool', name: '公海客户（领取 / 分配）' },
      { code: 'crm.channel', name: '渠道与合作机构管理' },
      { code: 'crm.report', name: '报表统计 / 业绩排行' },
    ],
  },
  {
    key: 'students',
    group: '学员管理',
    items: [
      { code: 'student.enroll', name: '新学员报名' },
      { code: 'student.view', name: '我的在籍学员' },
      { code: 'student.all', name: '全部在籍学员' },
      { code: 'student.edit', name: '编辑学员档案' },
      { code: 'order.view', name: '订单记录 / 缴费明细（本人）' },
      { code: 'order.all', name: '订单记录 / 缴费明细（全部）' },
      { code: 'order.pay', name: '登记缴费' },
      { code: 'order.refund', name: '退费' },
      { code: 'product.manage', name: '单期课程 / 套餐课程管理' },
      { code: 'grade.view', name: '成绩管理：查看考试与成绩' },
      { code: 'grade.manage', name: '成绩管理：创建考试、录入成绩' },
    ],
  },
  {
    key: 'schedule',
    group: '教务管理',
    items: [
      { code: 'schedule.view', name: '查看课程表 / 月课表 / 教室预约' },
      { code: 'schedule.own', name: '编辑本人课次（教师）' },
      { code: 'schedule.edit', name: '编辑全部课次（教务）' },
      { code: 'room.manage', name: '教室管理' },
      { code: 'class.manage', name: '班课管理' },
      { code: 'vip.manage', name: 'VIP 班级管理' },
      { code: 'vip.delete_confirmed', name: '删除已确认的 VIP 课次' },
      { code: 'attendance.manage', name: '出勤管理' },
    ],
  },
  {
    key: 'service',
    group: '教学服务',
    items: [
      { code: 'interview.manage', name: '面谈 / 面试时间段与记录' },
      { code: 'document.manage', name: '文书修改：分配批改教师' },
      { code: 'document.review', name: '文书修改：批改返还' },
      { code: 'print.manage', name: '资料打印处理' },
      { code: 'notice.manage', name: '发布通知公告' },
      { code: 'file.manage', name: '资料下载管理' },
    ],
  },
  {
    key: 'hr',
    group: '人事管理',
    items: [{ code: 'wage.review', name: '薪资申请审核' }],
  },
  {
    key: 'system',
    group: '系统设置',
    items: [
      { code: 'system.campus', name: '校区管理' },
      { code: 'system.user', name: '工号账户管理' },
      { code: 'system.role', name: '职务权限' },
      { code: 'system.subject', name: '教授课程（科目）' },
      { code: 'system.log', name: '操作日志' },
      { code: 'system.site', name: '站点设置（名称 / Logo / 登录页文案 / 主题色）' },
      { code: 'system.rules', name: '业务规则与下拉选项' },
      { code: 'system.edu', name: '成绩与档案设置 / 行业模板' },
      { code: 'system.mail', name: '邮件（SMTP）设置' },
    ],
  },
]

export const ALL_PERMISSION_CODES = PERMISSIONS.flatMap((g) => g.items.map((i) => i.code))
