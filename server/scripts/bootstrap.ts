/**
 * 安装向导的初始数据写入（由安装程序以子进程调用，数据库已建表）。
 * 参数通过环境变量 INSTALL_PAYLOAD（JSON）传入：
 *   { siteName, campus: { name, code, timezone }, admin: { staffNo, name, password, email? }, demoData }
 * demoData=true 时写入完整演示数据（与 npm run db:seed 相同），并把演示管理员替换为这里填写的账号。
 */
import '../src/env'
import { randomBytes } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { hashPassword } from '../src/lib/password'
import { createDefaults } from '../src/lib/defaults'
import { loadSettings } from '../src/lib/rules'
import { DEFAULT_PRESET, applyPreset, findPreset } from '../src/lib/presets'

interface Payload {
  siteName?: string
  campus: { name: string; code: string; timezone: string }
  admin: { staffNo: string; name: string; password: string; email?: string }
  demoData?: boolean
  /** 演示账号保留公开的演示密码（只用于公开演示站） */
  keepDemoPasswords?: boolean
  /** 行业模板 id（见 src/lib/presets.ts），默认日本升学私塾 */
  preset?: string
}

const p = JSON.parse(process.env.INSTALL_PAYLOAD ?? '{}') as Payload
if (!p.admin?.staffNo || !p.admin?.password || !p.campus?.name) {
  console.error('INSTALL_PAYLOAD 缺少必要字段')
  process.exit(1)
}

if (await prisma.user.count()) {
  console.error('数据库中已有账号，拒绝重复初始化')
  process.exit(1)
}

const preset = findPreset(p.preset ?? DEFAULT_PRESET) ?? findPreset(DEFAULT_PRESET)!
const passwordHash = await hashPassword(p.admin.password)

if (p.demoData) {
  const { seedDemo } = await import('../prisma/seed')
  await seedDemo() // 演示数据（含演示管理员 admin）
  const demoAdmin = await prisma.user.findUniqueOrThrow({ where: { staffNo: 'admin' } })
  await prisma.user.update({
    where: { id: demoAdmin.id },
    data: { staffNo: p.admin.staffNo, name: p.admin.name, email: p.admin.email || null, passwordHash },
  })
  if (p.keepDemoPasswords) {
    // 公开演示站：允许只读账号 demo 试用排课（可在「业务规则 → 演示」关闭）
    const value = JSON.stringify({ readOnlyCanSchedule: true })
    await prisma.setting.upsert({ where: { key: 'rules' }, create: { key: 'rules', value }, update: { value } })
    console.log('已写入演示数据，演示账号保留公开密码（jw01、t01 等 123456，只读账号 demo / demo123456）。只用于公开演示站！')
  } else {
    // 演示账号的密码是公开的（123456 等）：全部换成随机密码。账号保持启用，老师仍会出现在排课、班课等下拉里；
    // 需要登录时由管理员在「工号账户管理」重置密码；学生在学员详情中「重置学生端密码」
    const scrambled = await hashPassword(randomBytes(24).toString('base64url'))
    await prisma.user.updateMany({ where: { id: { not: demoAdmin.id } }, data: { passwordHash: scrambled } })
    await prisma.student.updateMany({ data: { portalPasswordHash: scrambled } })
    console.log('已写入演示数据。演示账号（jw01、t01、demo 等）的密码已改为随机值，需要登录时请在「工号账户管理」重置密码。')
  }
} else {
  await prisma.$transaction(async (tx) => {
    const roles = await createDefaults(tx, preset.subjects)
    const campus = await tx.campus.create({ data: { name: p.campus.name, code: p.campus.code, timezone: p.campus.timezone, sort: 1 } })
    await tx.user.create({
      data: {
        staffNo: p.admin.staffNo,
        name: p.admin.name,
        email: p.admin.email || null,
        passwordHash,
        identity: 'STAFF',
        campusId: campus.id,
        roles: { create: [{ roleId: roles.admin }] },
      },
    })
  })
  console.log('已写入基础数据（角色、教授课程、渠道、校区、管理员）')
}

// 行业模板：考试类型、成绩模板、档案字段、下拉选项（教授课程已在上面写入；演示数据时补充缺少的课程）
await loadSettings()
await applyPreset(preset.id, p.demoData ? undefined : ['exams', 'grades', 'profile', 'dicts'])
console.log(`已导入行业模板：${preset.name}`)

if (p.siteName) {
  const value = JSON.stringify({ siteName: p.siteName })
  await prisma.setting.upsert({ where: { key: 'site' }, create: { key: 'site', value }, update: { value } })
}
await prisma.$disconnect()
console.log('初始化完成')
