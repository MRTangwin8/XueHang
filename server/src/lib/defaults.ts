/**
 * 新系统的默认基础数据（安装向导与演示种子共用）：职务角色、教授课程、客户渠道。
 * 安装后均可在「系统设置」中修改。
 */
import type { Tx } from './prisma'

export const DEFAULT_SUBJECTS: Record<string, string[]> = {
  EJU: ['EJU日语', 'EJU文综', 'EJU文科数学', 'EJU生物', 'EJU物理', 'EJU化学', 'EJU理科数学'],
  语言与通识: ['JLPT', 'MBA', '英语', '国语', '世界史', '日本史'],
  TA: ['学部文科TA', '学部理科TA', '大学院文科TA', '大学院理科TA', '学部美术TA', '大学院美术TA'],
  大学院文科: ['大学院日本语教育学', '大学院教育学', '大学院经济学', '大学院经营学', '大学院国际关系学', '大学院社会学', '大学院传媒'],
  大学院理科: ['大学院电子电气', '大学院高数', '大学院情报', '大学院土木工程', '大学院生物', '大学院建筑'],
  美术: ['设计', '纯艺', 'ACG', '日式素描', '服装', '映像写真', '作品集排版'],
}

export const DEFAULT_ROLES: { key: string; name: string; dataScope: string; description?: string; isSystem?: boolean; readOnly?: boolean; codes: string[] }[] = [
  { key: 'admin', name: '超级管理员', dataScope: 'ALL', description: '校长 / 系统管理员，拥有全部权限', isSystem: true, codes: ['*'] },
  {
    key: 'academic',
    name: '教务',
    dataScope: 'CAMPUS',
    codes: [
      'daily.write', 'wage.claim', 'teacher.students', 'student.view', 'student.all', 'student.edit',
      'schedule.view', 'schedule.edit', 'room.manage', 'class.manage', 'vip.manage', 'vip.delete_confirmed', 'attendance.manage',
      'interview.manage', 'document.manage', 'document.review', 'print.manage', 'notice.manage', 'file.manage',
      'grade.view', 'grade.manage',
    ],
  },
  {
    key: 'sales',
    name: '市场销售',
    dataScope: 'SELF',
    codes: [
      'daily.write', 'crm.customer.view', 'crm.pool', 'crm.channel', 'student.enroll', 'student.view', 'student.edit',
      'order.view', 'order.pay', 'schedule.view', 'interview.manage',
    ],
  },
  {
    key: 'teacher',
    name: '教师',
    dataScope: 'SELF',
    codes: ['daily.write', 'wage.claim', 'teacher.students', 'schedule.view', 'schedule.own', 'attendance.manage', 'interview.manage', 'document.review', 'grade.manage'],
  },
  {
    key: 'clerk',
    name: '事务',
    dataScope: 'CAMPUS',
    codes: [
      'daily.write', 'student.all', 'order.all', 'order.pay', 'order.refund', 'product.manage',
      'print.manage', 'notice.manage', 'file.manage', 'wage.review', 'schedule.view', 'grade.view',
    ],
  },
  {
    key: 'readonly',
    name: '只读管理员',
    dataScope: 'ALL',
    description: '演示 / 审计用：可以查看全部页面和数据，但不能做任何修改',
    readOnly: true,
    codes: ['*'],
  },
]

export const DEFAULT_CHANNELS = ['渠道推荐', '渠道名单邀约', '语言学校说明会', '主动上门', '企宣&网络', '学员转介绍', '二次转化', '身边资源']

/** 写入默认角色 / 科目 / 渠道（幂等：已存在的跳过）。返回 { 角色 key → id } */
export async function createDefaults(tx: Tx, subjects: Record<string, string[]> = DEFAULT_SUBJECTS): Promise<Record<string, number>> {
  let sort = 1
  for (const [category, names] of Object.entries(subjects))
    for (const name of names) await tx.teachingSubject.upsert({ where: { name }, create: { name, category, sort: sort++ }, update: {} })
  const roleIds: Record<string, number> = {}
  for (const r of DEFAULT_ROLES) {
    const role = await tx.role.upsert({
      where: { name: r.name },
      create: { name: r.name, dataScope: r.dataScope, description: r.description, isSystem: !!r.isSystem, readOnly: !!r.readOnly, permissions: { create: r.codes.map((code) => ({ code })) } },
      update: {},
    })
    roleIds[r.key] = role.id
  }
  for (const [i, name] of DEFAULT_CHANNELS.entries()) await tx.channel.upsert({ where: { name }, create: { name, sort: i + 1 }, update: {} })
  return roleIds
}
