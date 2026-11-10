/**
 * 开发用种子数据（全部为虚构演示数据）。
 * 运行：npm run db:reset -w server（清库 + 建表 + 种子）
 *
 * 演示账号（仅本地开发）：
 *   教职工  admin / admin123        超级管理员
 *           jw01 ~ jw02 / 123456     教务
 *           sales01 ~ sales02 / 123456 市场销售
 *           t01 ~ t10 / 123456       教师
 *           sw01 / 123456            事务
 *           demo / demo123456        只读管理员（演示：能看全部，不能修改）
 *   学生端  S2026001 ~ S2026020 / 123456
 */
import '../src/env'
import { prisma } from '../src/lib/prisma'
import { pathToFileURL } from 'node:url'
import bcrypt from 'bcryptjs'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ALL_PERMISSION_CODES } from '../src/permissions'
import type { Campus, CourseProduct, Order, Organization, Prisma, Room, Student, User } from '../src/generated/prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)

async function main() {
  if (await prisma.campus.count()) {
    console.log('数据库已有数据，跳过种子。如需重建请运行 npm run db:reset -w server')
    return
  }
  const now = dayjs()
  const at = (dayOffset: number, hm: string, tz: string) =>
    dayjs.tz(`${now.tz(tz).add(dayOffset, 'day').format('YYYY-MM-DD')} ${hm}`, tz).toDate()
  const pw = await bcrypt.hash('123456', 10)
  const adminPw = await bcrypt.hash('admin123', 10)
  const demoPw = await bcrypt.hash('demo123456', 10)

  // ---------- 校区 ----------
  const campusData = [
    { code: 'SJK', name: '东京新宿校', timezone: 'Asia/Tokyo', address: '東京都新宿区・示例教学楼（虚构地址）' },
    { code: 'HCJ', name: '东京八王子校', timezone: 'Asia/Tokyo', address: '東京都八王子市・示例教学楼（虚构地址）' },
    { code: 'SPK', name: '北海道札幌校', timezone: 'Asia/Tokyo', address: '北海道札幌市・示例教学楼（虚构地址）' },
    { code: 'BJG', name: '北京国贸校', timezone: 'Asia/Shanghai', address: '北京市朝阳区国贸・示例教学楼（虚构地址）' },
  ]
  const campuses: Campus[] = []
  for (const [index, data] of campusData.entries())
    campuses.push(await prisma.campus.create({ data: { ...data, sort: index + 1 } }))
  const [sjk, hcj, spk, bjg] = campuses

  // ---------- 科目（教授课程）----------
  const subjectGroups: Record<string, string[]> = {
    EJU: ['EJU日语', 'EJU文综', 'EJU文科数学', 'EJU生物', 'EJU物理', 'EJU化学', 'EJU理科数学'],
    语言与通识: ['JLPT', 'MBA', '英语', '国语', '世界史', '日本史'],
    TA: ['学部文科TA', '学部理科TA', '大学院文科TA', '大学院理科TA', '学部美术TA', '大学院美术TA'],
    大学院文科: ['大学院日本语教育学', '大学院教育学', '大学院经济学', '大学院经营学', '大学院国际关系学', '大学院社会学', '大学院传媒'],
    大学院理科: ['大学院电子电气', '大学院高数', '大学院情报', '大学院土木工程', '大学院生物', '大学院建筑'],
    美术: ['设计', '纯艺', 'ACG', '日式素描', '服装', '映像写真', '作品集排版'],
  }
  let sort = 1
  for (const [category, names] of Object.entries(subjectGroups))
    for (const name of names) await prisma.teachingSubject.create({ data: { name, category, sort: sort++ } })
  const subj = async (name: string) => (await prisma.teachingSubject.findUniqueOrThrow({ where: { name } })).id

  // ---------- 角色 ----------
  const mkRole = (name: string, dataScope: string, codes: string[], description?: string, isSystem = false) =>
    prisma.role.create({ data: { name, dataScope, description, isSystem, permissions: { create: codes.map((code) => ({ code })) } } })
  const rAdmin = await mkRole('超级管理员', 'ALL', ['*'], '校长 / 系统管理员，拥有全部权限', true)
  const rReadOnly = await prisma.role.create({
    data: { name: '只读管理员', dataScope: 'ALL', readOnly: true, description: '演示 / 审计用：可以查看全部页面和数据，但不能做任何修改', permissions: { create: [{ code: '*' }] } },
  })
  const rJw = await mkRole('教务', 'CAMPUS', [
    'daily.write', 'wage.claim', 'teacher.students', 'student.view', 'student.all', 'student.edit',
    'schedule.view', 'schedule.edit', 'room.manage', 'class.manage', 'vip.manage', 'vip.delete_confirmed', 'attendance.manage',
    'interview.manage', 'document.manage', 'document.review', 'print.manage', 'notice.manage', 'file.manage',
    'grade.view', 'grade.manage',
  ])
  const rSales = await mkRole('市场销售', 'SELF', [
    'daily.write', 'crm.customer.view', 'crm.pool', 'crm.channel', 'student.enroll', 'student.view', 'student.edit',
    'order.view', 'order.pay', 'schedule.view', 'interview.manage',
  ])
  const rTeacher = await mkRole('教师', 'SELF', [
    'daily.write', 'wage.claim', 'teacher.students', 'schedule.view', 'schedule.own', 'attendance.manage', 'interview.manage', 'document.review', 'grade.enter',
  ])
  const rClerk = await mkRole('事务', 'CAMPUS', [
    'daily.write', 'student.all', 'order.all', 'order.pay', 'order.refund', 'product.manage', 'print.manage', 'notice.manage', 'file.manage', 'wage.review', 'schedule.view', 'grade.view',
  ])
  void ALL_PERMISSION_CODES

  // ---------- 教职工 ----------
  const mkUser = (staffNo: string, name: string, identity: string, roleId: number, campusId: number, extra: Pick<Prisma.UserUncheckedCreateInput, 'hourlyWage' | 'transportFee'> = {}, subjects: number[] = []) =>
    prisma.user.create({
      data: {
        staffNo, name, identity, campusId, passwordHash: staffNo === 'admin' ? adminPw : staffNo === 'demo' ? demoPw : pw,
        note: '虚构演示教职工，不对应真实个人',
        roles: { create: [{ roleId }] },
        subjects: { create: subjects.map((subjectId) => ({ subjectId })) },
        ...extra,
      },
    })
  const admin = await mkUser('admin', '系统管理员', 'STAFF', rAdmin.id, sjk.id)
  await mkUser('demo', '演示账号（只读）', 'STAFF', rReadOnly.id, sjk.id)
  const jw01 = await mkUser('jw01', '教务 林知夏', 'STAFF', rJw.id, sjk.id)
  const jw02 = await mkUser('jw02', '教务 森田', 'STAFF', rJw.id, spk.id)
  const sales01 = await mkUser('sales01', '销售 许明', 'STAFF', rSales.id, sjk.id)
  const sales02 = await mkUser('sales02', '销售 周悦', 'STAFF', rSales.id, bjg.id)
  const clerk = await mkUser('sw01', '事务 小林', 'STAFF', rClerk.id, sjk.id)
  await prisma.userCampus.createMany({
    data: [
      { userId: jw01.id, campusId: hcj.id }, { userId: jw02.id, campusId: bjg.id },
      { userId: sales01.id, campusId: hcj.id }, { userId: sales02.id, campusId: spk.id },
      ...[hcj, spk, bjg].map((campus) => ({ userId: clerk.id, campusId: campus.id })),
    ],
  })
  const teacherData = [
    { name: '王老师', campus: sjk, hourlyWage: 3000, transportFee: 400, subjects: ['EJU日语', 'JLPT', '国语'] },
    { name: '陈老师', campus: sjk, hourlyWage: 3500, transportFee: 300, subjects: ['世界史', '日本史', '大学院国际关系学'] },
    { name: '铃木老师', campus: sjk, hourlyWage: 3800, transportFee: 500, subjects: ['大学院文科TA', '大学院经营学', '大学院日本语教育学'] },
    { name: '佐藤老师', campus: hcj, hourlyWage: 3600, transportFee: 360, subjects: ['设计', '日式素描', '作品集排版'] },
    { name: '李老师', campus: hcj, hourlyWage: 3400, transportFee: 400, subjects: ['大学院教育学', '大学院社会学', '大学院文科TA'] },
    { name: '高桥老师', campus: hcj, hourlyWage: 3200, transportFee: 320, subjects: ['国语', '学部文科TA', 'JLPT'] },
    { name: '刘老师', campus: spk, hourlyWage: 4000, transportFee: 280, subjects: ['大学院经济学', '大学院经营学', 'EJU文综'] },
    { name: '山本老师', campus: spk, hourlyWage: 3300, transportFee: 300, subjects: ['JLPT', 'EJU日语', '英语'] },
    { name: '赵老师', campus: bjg, hourlyWage: 3500, transportFee: 0, subjects: ['EJU文科数学', 'EJU理科数学', '大学院高数'] },
    { name: '中村老师', campus: bjg, hourlyWage: 3600, transportFee: 0, subjects: ['EJU文综', '世界史', '大学院国际关系学'] },
  ]
  const teachers: User[] = []
  for (const [index, teacher] of teacherData.entries()) {
    const subjects = await Promise.all(teacher.subjects.map(subj))
    teachers.push(await mkUser(`t${String(index + 1).padStart(2, '0')}`, teacher.name, 'TEACHER', rTeacher.id, teacher.campus.id,
      { hourlyWage: teacher.hourlyWage, transportFee: teacher.transportFee }, subjects))
  }
  const salesByCampus = [sales01, sales01, sales02, sales02]
  const academicFor = (campusId: number) => campusId === sjk.id || campusId === hcj.id ? jw01 : jw02

  // ---------- 教室 ----------
  const roomsByCampus = new Map<number, { classroom: number; secondary: number; vip1: number; vip2: number; online: number }>()
  for (const campus of campuses) {
    const roomData = [
      { name: '301教室', building: '本馆3F', kind: 'CLASS', capacity: 12, allowVip: false },
      { name: campus.id === hcj.id ? '302画室' : '302教室', building: '本馆3F', kind: campus.id === hcj.id ? 'STUDIO' : 'CLASS', capacity: 10, allowVip: false },
      { name: 'VIP1', building: '本馆5F', kind: 'VIP', capacity: 2, allowVip: true },
      { name: 'VIP2', building: '本馆5F', kind: 'VIP', capacity: 3, allowVip: true },
      { name: '线上教室', building: '线上', kind: 'ONLINE', capacity: 50, allowVip: true },
    ]
    const rooms: Room[] = []
    for (const [index, data] of roomData.entries())
      rooms.push(await prisma.room.create({ data: { ...data, campusId: campus.id, sort: index + 1, note: '虚构演示教室' } }))
    roomsByCampus.set(campus.id, { classroom: rooms[0].id, secondary: rooms[1].id, vip1: rooms[2].id, vip2: rooms[3].id, online: rooms[4].id })
  }
  const roomsFor = (campusId: number) => {
    const rooms = roomsByCampus.get(campusId)
    if (!rooms) throw new Error('演示校区缺少教室')
    return rooms
  }

  // ---------- 渠道 / 机构 ----------
  for (const [i, name] of ['渠道推荐', '渠道名单邀约', '语言学校说明会', '主动上门', '企宣&网络', '学员转介绍', '二次转化', '身边资源'].entries())
    await prisma.channel.create({ data: { name, sort: i + 1 } })
  const channels = await prisma.channel.findMany({ orderBy: { sort: 'asc' } })
  const organizations: Organization[] = []
  const regions = [['東京都', '新宿区'], ['東京都', '八王子市'], ['北海道', '札幌市'], ['北京市', '朝阳区']]
  for (const [index, campus] of campuses.entries()) {
    organizations.push(await prisma.organization.create({
      data: {
        campusId: campus.id, name: `示例${campus.name}合作语言学校（虚构）`, type: '日语学校',
        province: regions[index][0], city: regions[index][1], address: campus.address,
        contactName: ['林老师', '森老师', '田中老师', '许老师'][index], ownerId: salesByCampus[index].id,
        rebateRule: '一对一15% 班课20%', rebateRateClass: 0.2, rebateRateVip: 0.15,
        status: 'ACTIVE', signedAt: at(-90, '10:00', campus.timezone), note: '虚构演示合作机构',
      },
    }))
  }

  // ---------- 学员 ----------
  const stuData = [
    ['刘子安', '普通高中', '学部文科', '星川大学（虚构）', '历史学', '学部', 0],
    ['林沐晴', '本科', '大学院文科', '青岚大学（虚构）', '经营学', '修士', 2],
    ['许知远', '普通高中国际部', '学部文科', '星川大学（虚构）', '国际关系学', '学部', 1],
    ['周予宁', '本科', '大学院文科', '远山大学（虚构）', '日本语教育学', '研究生', 2],
    ['沈书言', '国际高中', '学部文科', '青岚大学（虚构）', '社会学', '学部', 0],
    ['唐可欣', '专门学校', '学部美术', '花丘艺术大学（虚构）', '视觉设计', '学部', 3],
    ['陆星禾', '本科', '大学院美术', '花丘艺术大学（虚构）', '艺术设计', '修士', 3],
    ['叶思齐', '本科', '大学院文科', '远山大学（虚构）', '教育学', '修士', 4],
    ['苏景明', '大专', '学部美术', '花丘艺术大学（虚构）', '映像艺术', '学部', 3],
    ['何若溪', '普通高中', '学部文科', '星川大学（虚构）', '文学', '学部', 5],
    ['宋亦辰', '本科', '大学院文科', '北辰大学（虚构）', '经济学', '修士', 6],
    ['顾念初', '本科', '大学院文科', '北辰大学（虚构）', '经营学', '修士', 7],
    ['程子墨', '国际高中', '学部文科', '青岚大学（虚构）', '经济学', '学部', 6],
    ['邓嘉树', '本科', '大学院文科', '北辰大学（虚构）', '区域经济学', '修士', 6],
    ['方知夏', '普通高中国际部', '日语', '星川大学（虚构）', '日本语学', '学部', 7],
    ['于清越', '普通高中', '学部理科', '远山大学（虚构）', '情报学', '学部', 8],
    ['韩慕言', '普通高中国际部', '学部文科', '青岚大学（虚构）', '国际关系学', '学部', 9],
    ['罗映雪', '国际高中', '学部文科', '星川大学（虚构）', '经济学', '学部', 9],
    ['丁思源', '本科', '大学院理科', '远山大学（虚构）', '数理情报学', '修士', 8],
    ['潘语桐', '普通高中', '学部文科', '北辰大学（虚构）', '公共政策', '学部', 9],
  ] as const
  const students: Student[] = []
  for (const [index, [name, education, subjectCategory, targetUniversity, targetMajor, targetDegree, teacherIndex]] of stuData.entries()) {
    const campusIndex = Math.floor(index / 5)
    const campus = campuses[campusIndex]
    students.push(await prisma.student.create({
      data: {
        campusId: campus.id, studentNo: `S2026${String(index + 1).padStart(3, '0')}`, name, education, subjectCategory,
        gender: index % 2 ? 'F' : 'M', languageSchool: `示例${campus.name}语言学校（虚构）`,
        graduatedSchool: education === '本科' ? '示例远山学院（虚构）' : '示例青禾学校（虚构）',
        targetUniversity, targetMajor, targetDegree, salesId: salesByCampus[campusIndex].id,
        mainTeacherId: teachers[teacherIndex].id, contractTeacherId: teachers[teacherIndex].id,
        channelId: channels[index % channels.length].id, organizationId: index % 2 === 0 ? organizations[campusIndex].id : null,
        enrolledAt: at(-120, '10:00', campus.timezone), enrollTerm: now.tz(campus.timezone).subtract(4, 'month').format('YYYY年M月'),
        portalPasswordHash: pw, portalEnabled: true, email: `student${index + 1}@example.com`,
        note: '虚构演示学员；目标学校、考试和合格信息均为模拟数据',
      },
    }))
  }
  await prisma.studentExam.createMany({
    data: [
      { studentId: students[0].id, examType: 'JLPT', level: 'N2', score: 128, examDate: at(-210, '09:00', sjk.timezone), scores: JSON.stringify({ vocab: 40, reading: 43, listening: 45 }), note: '模拟成绩' },
      { studentId: students[0].id, examType: 'EJU', attempt: 1, score: 620, examDate: at(-150, '09:00', sjk.timezone), scores: JSON.stringify({ japanese: 305, writing: 37, general: 142, math1: 136 }), note: '模拟成绩' },
      { studentId: students[1].id, examType: 'JLPT', level: 'N1', score: 138, examDate: at(-180, '09:00', sjk.timezone), scores: JSON.stringify({ vocab: 44, reading: 48, listening: 46 }), note: '模拟成绩' },
      { studentId: students[5].id, examType: 'JLPT', level: 'N2', score: 121, examDate: at(-160, '09:00', hcj.timezone), scores: JSON.stringify({ vocab: 39, reading: 40, listening: 42 }), note: '模拟成绩' },
      { studentId: students[10].id, examType: 'EJU', attempt: 1, score: 638, examDate: at(-125, '09:00', spk.timezone), scores: JSON.stringify({ japanese: 312, writing: 38, general: 148, math1: 140 }), note: '模拟成绩' },
      { studentId: students[10].id, examType: 'JLPT', level: 'N1', score: 142, examDate: at(-100, '09:00', spk.timezone), scores: JSON.stringify({ vocab: 46, reading: 47, listening: 49 }), note: '模拟成绩' },
      { studentId: students[15].id, examType: 'EJU', attempt: 1, score: 590, examDate: at(-140, '09:00', bjg.timezone), scores: JSON.stringify({ japanese: 280, writing: 32, general: 136, math1: 142 }), note: '模拟成绩' },
      { studentId: students[17].id, examType: 'EJU', attempt: 2, score: 658, examDate: at(-70, '09:00', bjg.timezone), scores: JSON.stringify({ japanese: 318, writing: 40, general: 145, math1: 155 }), note: '模拟成绩' },
    ],
  })
  for (const index of [1, 6, 11, 16]) {
    const student = students[index]
    await prisma.studentAdmission.create({
      data: { studentId: student.id, sort: 1, university: student.targetUniversity!, faculty: student.targetDegree === '学部' ? '示例学部（虚构）' : '示例研究科（虚构）', department: student.targetMajor, major: student.targetMajor,
        admittedAt: at(-30, '10:00', campuses[Math.floor(index / 5)].timezone), note: '虚构合格案例，仅用于展示' },
    })
  }

  // ---------- 班课配置 ----------
  const classData = [
    { name: '历史专业大课', subject: '世界史', category: '学部文科', campus: sjk, teacher: teachers[1], roomId: roomsFor(sjk.id).classroom, studentIndexes: [0, 1, 2, 3], weekdays: [1, 4], startTime: '10:00', endTime: '12:00' },
    { name: '6月留考日语对策A班', subject: 'EJU日语', category: '学部文科', campus: sjk, teacher: teachers[0], roomId: roomsFor(sjk.id).classroom, studentIndexes: [0, 1, 2, 3, 4], weekdays: [2, 5, 7], startTime: '09:00', endTime: '11:00' },
    { name: '大学院面试对策', subject: '大学院文科TA', category: '大学院文科', campus: sjk, teacher: teachers[2], roomId: roomsFor(sjk.id).online, studentIndexes: [1, 2, 3, 4], weekdays: [3, 6], startTime: '18:00', endTime: '20:00' },
    { name: '专业背景提升课', subject: '大学院教育学', category: '大学院文科', campus: hcj, teacher: teachers[4], roomId: roomsFor(hcj.id).classroom, studentIndexes: [5, 6, 7, 8, 9], weekdays: [1, 4], startTime: '14:00', endTime: '16:00' },
    { name: '美术作品集辅导', subject: '设计', category: '大学院美术', campus: hcj, teacher: teachers[3], roomId: roomsFor(hcj.id).secondary, studentIndexes: [5, 6, 7, 8], weekdays: [2, 6], startTime: '10:00', endTime: '12:00' },
    { name: '小论文写作', subject: '国语', category: '学部文科', campus: hcj, teacher: teachers[5], roomId: roomsFor(hcj.id).online, studentIndexes: [6, 7, 8, 9], weekdays: [3, 5], startTime: '18:30', endTime: '20:00' },
    { name: '经济专业课', subject: '大学院经济学', category: '大学院文科', campus: spk, teacher: teachers[6], roomId: roomsFor(spk.id).classroom, studentIndexes: [10, 11, 12, 13, 14], weekdays: [2, 6], startTime: '13:00', endTime: '15:00' },
    { name: 'JLPT N1 冲刺班', subject: 'JLPT', category: '日语', campus: spk, teacher: teachers[7], roomId: roomsFor(spk.id).secondary, studentIndexes: [10, 11, 12, 13], weekdays: [1, 3, 5], startTime: '18:00', endTime: '20:00' },
    { name: 'EJU 数学1 强化', subject: 'EJU文科数学', category: '学部文科', campus: bjg, teacher: teachers[8], roomId: roomsFor(bjg.id).classroom, studentIndexes: [15, 16, 17, 18, 19], weekdays: [1, 4, 7], startTime: '09:30', endTime: '11:30' },
    { name: '综合科目时事专题', subject: 'EJU文综', category: '学部文科', campus: bjg, teacher: teachers[9], roomId: roomsFor(bjg.id).secondary, studentIndexes: [16, 17, 18, 19], weekdays: [2, 5, 6], startTime: '15:00', endTime: '17:00' },
  ]

  // ---------- 课程产品 / 套餐 ----------
  const singles: CourseProduct[] = []
  for (const [index, course] of classData.entries()) {
    singles.push(await prisma.courseProduct.create({
      data: { type: 'SINGLE', name: `${course.name}（演示单期）`, category: course.category, campusId: course.campus.id,
        price: course.campus.id === bjg.id ? 4800 + index * 100 : 50000 + index * 5000,
        description: '虚构演示课程，金额仅供展示', sort: index + 1 },
    }))
  }
  const packageHours = [20, 24, 18, 16]
  const packagePrices = [580000, 480000, 420000, 18000]
  const packages: CourseProduct[] = []
  for (const [index, campus] of campuses.entries()) {
    packages.push(await prisma.courseProduct.create({
      data: { type: 'PACKAGE', campusId: campus.id, name: `${campus.name}综合课程套餐 + VIP ${packageHours[index]}h`,
        category: index === 1 ? '大学院美术' : index === 2 ? '大学院文科' : '学部文科',
        price: packagePrices[index], originalPrice: Math.round(packagePrices[index] * 1.25), vipHours: packageHours[index],
        description: '虚构演示套餐，包含本校区所列班课及约定 VIP 课时', sort: 20 + index,
        packageItems: { create: singles.filter((product) => product.campusId === campus.id).map((product) => ({ productId: product.id })) } },
    }))
  }

  // ---------- VIP 配置 / 订单 / 缴费 ----------
  const vipData = [
    { name: 'EJU 日语一对一', subject: 'EJU日语', student: students[0], teacher: teachers[0], campus: sjk },
    { name: '大学院面试一对一', subject: '大学院文科TA', student: students[1], teacher: teachers[2], campus: sjk },
    { name: '美术作品集一对一', subject: '设计', student: students[5], teacher: teachers[3], campus: hcj },
    { name: '专业研究计划一对一', subject: '大学院文科TA', student: students[7], teacher: teachers[4], campus: hcj },
    { name: '大学院经济一对一', subject: '大学院经济学', student: students[10], teacher: teachers[6], campus: spk },
    { name: 'JLPT N1 听读强化', subject: 'JLPT', student: students[11], teacher: teachers[7], campus: spk },
    { name: 'EJU 数学一对一', subject: 'EJU文科数学', student: students[15], teacher: teachers[8], campus: bjg },
    { name: '综合科目论述一对一', subject: 'EJU文综', student: students[17], teacher: teachers[9], campus: bjg },
  ]
  const orderData = [
    ...vipData.map((vip, index) => {
      const campusIndex = Math.floor(index / 2)
      const product = packages[campusIndex]
      return { student: vip.student, campus: vip.campus, product, classMode: 'BOTH', vipHours: packageHours[campusIndex], vipContent: vip.name,
        payments: index % 3 === 0 ? [product.price / 2] : index % 3 === 1 ? [product.price * 0.6, product.price * 0.4] : [] }
    }),
    ...[2, 6, 12, 16].map((studentIndex, campusIndex) => {
      const product = singles.find((single) => single.campusId === campuses[campusIndex].id)!
      return { student: students[studentIndex], campus: campuses[campusIndex], product, classMode: 'CLASS', vipHours: null, vipContent: null,
        payments: campusIndex === 2 ? [] : [product.price * (campusIndex === 1 ? 0.5 : 1)] }
    }),
  ]
  const orders: Order[] = []
  for (const [index, order] of orderData.entries()) {
    const campusIndex = campuses.findIndex((campus) => campus.id === order.campus.id)
    const sales = salesByCampus[campusIndex]
    const currency = order.campus.id === bjg.id ? 'CNY' : 'JPY'
    const paidAmount = order.payments.reduce((sum, amount) => sum + amount, 0)
    const listAmount = order.product.originalPrice ?? order.product.price
    orders.push(await prisma.order.create({
      data: { orderNo: `SO2026${String(index + 1).padStart(6, '0')}`, studentId: order.student.id, campusId: order.campus.id,
        salesId: sales.id, packageId: order.classMode === 'BOTH' ? order.product.id : null, classMode: order.classMode,
        vipHours: order.vipHours, vipContent: order.vipContent, currency, listAmount, discountAmount: listAmount - order.product.price,
        discountReason: listAmount > order.product.price ? '学费折扣' : null, payableAmount: order.product.price, paidAmount,
        status: paidAmount === 0 ? 'UNPAID' : paidAmount === order.product.price ? 'PAID' : 'PARTIAL',
        signedAt: at(-35, '10:00', order.campus.timezone), expireAt: at(180, '23:59', order.campus.timezone), note: '虚构演示订单及收款',
        items: { create: [{ productId: order.product.id, name: order.product.name, price: order.product.price }] },
        payments: { create: order.payments.map((amount, paymentIndex) => ({ amount, currency, method: currency === 'CNY' ? '微信支付' : '银行转账',
          kind: paymentIndex === 0 ? '报名缴费' : '报名缴费补款', paidAt: at(-34 + paymentIndex * 7, '11:00', order.campus.timezone), payeeId: sales.id })) } },
    }))
  }

  // ---------- 客户 / 跟进 ----------
  const customerNames = ['钱思雨', '冯泽宇', '褚安宁', '卫书瑶', '蒋若衡', '余欣然', '袁星野', '夏知秋', '姚嘉言', '梁初晴', '孟以南', '白若竹']
  for (const [index, name] of customerNames.entries()) {
    const campusIndex = Math.floor(index / 3)
    const campus = campuses[campusIndex]
    const sales = salesByCampus[campusIndex]
    const owned = index % 3 !== 2
    const intentLevel = ['A', 'B', 'C', 'D'][index % 4]
    const followAt = at(-3, '15:00', campus.timezone)
    const customer = await prisma.customer.create({
      data: { campusId: campus.id, name, intentLevel, status: owned ? 'FOLLOWING' : index % 2 ? 'LOST' : 'NEW', ownerId: owned ? sales.id : null,
        channelId: channels[index % channels.length].id, organizationId: index % 2 ? organizations[campusIndex].id : null,
        education: index % 2 ? '本科' : '普通高中', subjectCategory: index % 2 ? '大学院文科' : '学部文科',
        targetSchool: index % 2 ? '青岚大学（虚构）' : '星川大学（虚构）', source: index % 2 ? '说明会' : '线上咨询',
        assignedAt: owned ? at(-7, '10:00', campus.timezone) : null, lastFollowAt: owned ? followAt : null,
        nextFollowAt: owned ? at(2, '14:00', campus.timezone) : null, note: '虚构演示客户，不对应真实个人' },
    })
    if (!owned) continue
    await prisma.followUp.createMany({
      data: [
        { customerId: customer.id, userId: sales.id, method: '微信', content: `初次沟通，介绍${campus.name}的课程与申请规划（模拟）`, intentLevel,
          createdAt: at(-6, '14:00', campus.timezone), nextFollowAt: followAt },
        { customerId: customer.id, userId: sales.id, method: '线上会议', content: '已发送课程介绍，约定下一次试听咨询（模拟）', intentLevel,
          createdAt: followAt, nextFollowAt: at(2, '14:00', campus.timezone) },
      ],
    })
  }

  // ---------- 排课冲突：统一检查教室 / 教师 / 全体学员 ----------
  const occupied = new Map<string, { start: number; end: number }[]>()
  let rejectedSlots = 0
  const reserveSlot = (startAt: Date, endAt: Date, roomId: number, teacherId: number, studentIds: number[]) => {
    const start = startAt.getTime()
    const end = endAt.getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('演示课次时间无效')
    const keys = [`room:${roomId}`, `teacher:${teacherId}`, ...studentIds.map((studentId) => `student:${studentId}`)]
    if (keys.some((key) => occupied.get(key)?.some((slot) => start < slot.end && slot.start < end))) {
      rejectedSlots++
      return false
    }
    for (const key of keys) {
      const slots = occupied.get(key) ?? []
      slots.push({ start, end })
      occupied.set(key, slots)
    }
    return true
  }

  // ---------- 班课 / 循环课次 / 出勤 / 课堂记录 ----------
  const classes = []
  for (const [classIndex, course] of classData.entries()) {
    const { campus, teacher } = course
    const members = course.studentIndexes.map((index) => students[index])
    const createdById = academicFor(campus.id).id
    const group = await prisma.classGroup.create({
      data: { campusId: campus.id, name: course.name, subject: course.subject, teacherId: teacher.id,
        defaultRoomId: course.roomId, productId: singles[classIndex].id, startDate: at(-14, '00:00', campus.timezone),
        endDate: at(21, '23:59', campus.timezone), note: '虚构演示班课，按校区当地时间排课',
        createdAt: at(-15, '09:00', campus.timezone),
        students: { create: members.map((student) => ({ studentId: student.id, joinedAt: at(-15, '10:00', campus.timezone) })) } },
    })
    classes.push({ ...course, group, members })
    const series = await prisma.sessionSeries.create({
      data: { startDate: now.tz(campus.timezone).subtract(14, 'day').format('YYYY-MM-DD'),
        endDate: now.tz(campus.timezone).add(21, 'day').format('YYYY-MM-DD'), weekdays: course.weekdays.join(','),
        startTime: course.startTime, endTime: course.endTime, timezone: campus.timezone, createdById,
        createdAt: at(-15, '09:00', campus.timezone) },
    })
    let lessonRecorded = false
    for (let dayOffset = -14; dayOffset <= 21; dayOffset++) {
      const weekday = ((now.tz(campus.timezone).add(dayOffset, 'day').day() + 6) % 7) + 1
      if (!course.weekdays.includes(weekday)) continue
      const startAt = at(dayOffset, course.startTime, campus.timezone)
      const endAt = at(dayOffset, course.endTime, campus.timezone)
      if (!reserveSlot(startAt, endAt, course.roomId, teacher.id, members.map((student) => student.id))) continue
      const confirmed = endAt.getTime() <= now.valueOf()
      const recordLesson = confirmed && dayOffset >= -7 && !lessonRecorded
      await prisma.session.create({
        data: { campusId: campus.id, kind: 'CLASS', title: course.name, roomId: course.roomId, teacherId: teacher.id,
          classGroupId: group.id, seriesId: series.id, startAt, endAt, hours: 0, status: confirmed ? 'CONFIRMED' : 'SCHEDULED',
          confirmedAt: confirmed ? endAt : null, confirmedBy: confirmed ? 'STAFF' : null, createdById,
          createdAt: at(-15, '09:00', campus.timezone),
          attendances: confirmed ? { create: members.map((student, memberIndex) => {
            const mark = (dayOffset + 14 + classIndex + memberIndex) % 20
            const status = mark === 0 ? 'ABSENT' : mark === 1 ? 'LEAVE' : mark === 2 ? 'LATE' : 'PRESENT'
            return { studentId: student.id, status, recordedById: teacher.id, recordedAt: endAt,
              note: status === 'PRESENT' ? null : status === 'LATE' ? '迟到约十分钟（模拟）' : status === 'LEAVE' ? '已提前请假（模拟）' : '未到课，待联系（模拟）' }
          }) } : undefined,
          lessonRecord: recordLesson ? { create: { teacherId: teacher.id, content: `${course.subject}：重点梳理、例题讲解与课堂讨论（模拟）`,
            homework: '复习本次讲义并完成配套练习，下次课交流解题思路。', performance: '多数同学能够完成练习，个别知识点需继续巩固。',
            studentVisible: true, createdAt: endAt } } : undefined },
      })
      if (recordLesson) lessonRecorded = true
    }
  }

  // ---------- VIP 课次：过去两次 / 昨日待确认 / 本周及下周预约 ----------
  const vipTimes = [
    ['08:00', '09:30'], ['12:00', '13:30'], ['16:15', '17:45'], ['20:15', '21:45'],
    ['14:30', '16:00'], ['10:00', '11:30'], ['18:30', '20:00'],
  ] as const
  const vipSummaries = []
  for (const [index, config] of vipData.entries()) {
    const { campus, teacher, student } = config
    const roomId = index % 2 === 0 ? roomsFor(campus.id).vip1 : roomsFor(campus.id).vip2
    const planned: Prisma.SessionUncheckedCreateWithoutVipPackageInput[] = []
    const addVipSlot = (dayOffsets: number[], status: 'CONFIRMED' | 'SCHEDULED', finished: boolean) => {
      for (const dayOffset of dayOffsets) {
        for (let timeIndex = 0; timeIndex < vipTimes.length; timeIndex++) {
          const [startTime, endTime] = vipTimes[(timeIndex + index + planned.length) % vipTimes.length]
          const startAt = at(dayOffset, startTime, campus.timezone)
          const endAt = at(dayOffset, endTime, campus.timezone)
          if (finished ? endAt.getTime() > now.valueOf() : startAt.getTime() <= now.valueOf()) continue
          if (finished && status === 'SCHEDULED' && endAt.getTime() <= now.subtract(2, 'day').valueOf()) continue
          if (!reserveSlot(startAt, endAt, roomId, teacher.id, [student.id])) continue
          const recordLesson = finished && (status === 'SCHEDULED' || planned.length === 0)
          planned.push({ campusId: campus.id, kind: 'VIP', title: `VIP ${student.name} · ${config.name}`, roomId, teacherId: teacher.id,
            startAt, endAt, hours: (endAt.getTime() - startAt.getTime()) / 3600000, status,
            confirmedAt: status === 'CONFIRMED' ? endAt : null, confirmedBy: status === 'CONFIRMED' ? 'STAFF' : null,
            createdById: academicFor(campus.id).id, createdAt: at(-15, '09:00', campus.timezone),
            note: finished && status === 'SCHEDULED' ? '已下课，待学员或教务确认（模拟）' : '虚构演示 VIP 课次',
            attendances: finished ? { create: [{ studentId: student.id, status: 'PRESENT', recordedById: teacher.id, recordedAt: endAt }] } : undefined,
            lessonRecord: recordLesson ? { create: { teacherId: teacher.id, content: `${config.subject}：针对性讲解与个别练习反馈（模拟）`,
              homework: '根据反馈修改练习，下次课检查。', performance: '能主动提问，学习目标明确。', studentVisible: true, createdAt: endAt } } : undefined })
          return true
        }
      }
      return false
    }
    if (!addVipSlot([-10], 'CONFIRMED', true) || !addVipSlot([-4], 'CONFIRMED', true) || !addVipSlot([-1], 'SCHEDULED', true))
      throw new Error(`${config.name} 缺少可用的历史课次时间`)

    const weekday = ((now.tz(campus.timezone).day() + 6) % 7) + 1
    const currentWeek = Array.from({ length: 8 - weekday }, (_, offset) => offset)
    const nextWeek = Array.from({ length: 7 }, (_, offset) => 8 - weekday + offset)
    const followingWeek = Array.from({ length: 7 }, (_, offset) => 15 - weekday + offset)
    for (const days of [currentWeek, [...currentWeek].reverse(), nextWeek, [...nextWeek].reverse()]) {
      if (!addVipSlot(days, 'SCHEDULED', false) && !addVipSlot([...nextWeek, ...followingWeek], 'SCHEDULED', false))
        throw new Error(`${config.name} 缺少可用的预约时间`)
    }
    const totalHours = packageHours[Math.floor(index / 2)]
    const usedHours = planned.filter((session) => session.status === 'CONFIRMED').reduce((sum, session) => sum + (session.hours ?? 0), 0)
    const pendingHours = planned.filter((session) => session.status === 'SCHEDULED').reduce((sum, session) => sum + (session.hours ?? 0), 0)
    if (usedHours < 0 || pendingHours < 0 || usedHours + pendingHours > totalHours) throw new Error(`${config.name} 课时账本异常`)
    await prisma.vipPackage.create({
      data: { studentId: student.id, orderId: orders[index].id, name: config.name, subject: config.subject,
        totalHours, usedHours, pendingHours, expireAt: at(180, '23:59', campus.timezone), note: '虚构演示课时包；账本由实际课次汇总',
        teachers: { create: [{ teacherId: teacher.id }] }, sessions: { create: planned } },
    })
    vipSummaries.push({ 课时包: config.name, 学员: student.studentNo, 教师: teacher.name, 校区: campus.name,
      总课时: totalHours, 已用: usedHours, 待确认: pendingHours, 可用: totalHours - usedHours - pendingHours, 课次: planned.length })
  }

  // ---------- 成绩管理：三次 EJU 文科模考 ----------
  const mockConf = {
    subjects: [
      { key: 'japanese', name: '日语', max: 400 },
      { key: 'writing', name: '记述', max: 50 },
      { key: 'general', name: '综合科目', max: 200 },
      { key: 'math1', name: '数学1', max: 200 },
    ],
    totalMode: 'sum',
    scoreStep: 1,
  }
  const mockBase = [
    [268, 32, 128, 140],
    [301, 38, 141, 112],
    [236, 27, 119, 166],
    [322, 41, 150, 95],
    [255, 30, 102, 150],
  ]
  const ejuClass = classes.find((course) => course.name === '6月留考日语对策A班')!
  const takers = ejuClass.members
  for (const [n, [ago, kind]] of ([[70, 'EJU 模考'], [42, 'EJU 模考'], [14, 'EJU 模考']] as const).entries()) {
    await prisma.assessment.create({
      data: {
        campusId: ejuClass.campus.id,
        name: `EJU 文科模考 第${n + 1}回`,
        kind,
        examDate: at(-ago, '00:00', ejuClass.campus.timezone),
        classGroupId: n === 2 ? ejuClass.group.id : null,
        subjects: JSON.stringify(mockConf),
        published: n < 2,
        createdById: ejuClass.teacher.id,
        note: '虚构演示模考成绩；第三回名单与关联班课一致',
        scores: {
          create: takers.map((st, i) => {
            if (n === 1 && i === 4) return { studentId: st.id, absent: true }
            const vals = mockBase[i].map((v, k) => Math.min(mockConf.subjects[k].max, v + n * [12, 2, 6, 8][k] + ((i * 7 + n * 3) % 9) - 4))
            const scores = Object.fromEntries(mockConf.subjects.map((sub, k) => [sub.key, vals[k]]))
            return { studentId: st.id, scores: JSON.stringify(scores), total: vals.reduce((a, b) => a + b, 0), comment: i === 0 && n === 2 ? '日语进步明显，数学需加强计算速度' : null }
          }),
        },
      },
    })
  }

  // ---------- 历史专业测验 ----------
  const historyClass = classes.find((course) => course.name === '历史专业大课')!
  const historySubjects = [
    { key: 'chineseHistory', name: '中国史', max: 100 },
    { key: 'worldHistory', name: '世界史', max: 100 },
    { key: 'essay', name: '论述', max: 100 },
  ]
  await prisma.assessment.create({
    data: { campusId: historyClass.campus.id, name: '历史专业大课 期中测验', kind: '单元测验',
      examDate: at(-5, '10:00', historyClass.campus.timezone), classGroupId: historyClass.group.id,
      subjects: JSON.stringify({ subjects: historySubjects, totalMode: 'sum', scoreStep: 1 }),
      published: true, createdById: historyClass.teacher.id, note: '虚构演示测验成绩',
      scores: { create: historyClass.members.map((student, index) => {
        const values = [68 + index * 5, 75 + index * 3, 70 + index * 4]
        return { studentId: student.id, scores: JSON.stringify(Object.fromEntries(historySubjects.map((subject, subjectIndex) => [subject.key, values[subjectIndex]]))),
          total: values.reduce((sum, score) => sum + score, 0), comment: index === 0 ? '史实掌握较好，论述需补充比较视角。' : '注意论点与史料之间的对应关系。' }
      }) } },
  })

  // ---------- 通知 ----------
  const year = now.tz(sjk.timezone).year()
  await prisma.notice.createMany({
    data: [
      { title: `${year}-${year + 1} 年末年始安排（演示）`, content: '<p>年末年始各校区开放与课程安排以当地课表为准，请提前向教务确认。本通知为虚构演示内容。</p>', audience: 'ALL', authorId: admin.id, pinned: true },
      { title: '【重要】课程反馈与课时确认（演示）', content: '<p>VIP 下课后请及时填写课堂记录；默认下课 48 小时后自动确认，也可由学员或教务确认。演示课时包含昨日待确认课次。</p>', audience: 'STAFF', authorId: jw01.id },
      ...campuses.map((campus) => ({ campusId: campus.id, title: `${campus.name}学习交流安排（演示）`,
        content: `<p>请按课表参加班课及 VIP 辅导，线上课程也会占用教师与学员时间。课表时区：${campus.timezone}。本通知为虚构演示内容。</p>`,
        audience: 'ALL', authorId: academicFor(campus.id).id })),
    ],
  })

  // ---------- 写入汇总 ----------
  const counts = {
    Campus: prisma.campus.count(), Room: prisma.room.count(), Role: prisma.role.count(), RolePermission: prisma.rolePermission.count(),
    User: prisma.user.count(), UserRole: prisma.userRole.count(), UserCampus: prisma.userCampus.count(),
    TeachingSubject: prisma.teachingSubject.count(), UserSubject: prisma.userSubject.count(),
    Channel: prisma.channel.count(), Organization: prisma.organization.count(), Customer: prisma.customer.count(), FollowUp: prisma.followUp.count(),
    Student: prisma.student.count(), StudentExam: prisma.studentExam.count(), StudentAdmission: prisma.studentAdmission.count(),
    CourseProduct: prisma.courseProduct.count(), PackageItem: prisma.packageItem.count(), Order: prisma.order.count(), OrderItem: prisma.orderItem.count(), Payment: prisma.payment.count(),
    ClassGroup: prisma.classGroup.count(), ClassGroupStudent: prisma.classGroupStudent.count(), SessionSeries: prisma.sessionSeries.count(), Session: prisma.session.count(),
    VipPackage: prisma.vipPackage.count(), VipPackageTeacher: prisma.vipPackageTeacher.count(), Attendance: prisma.attendance.count(), LessonRecord: prisma.lessonRecord.count(),
    Assessment: prisma.assessment.count(), AssessmentScore: prisma.assessmentScore.count(), Notice: prisma.notice.count(),
  }
  console.log('种子数据已写入（全部为虚构演示数据）。')
  console.table(await Promise.all(Object.entries(counts).map(async ([entity, count]) => ({ 实体: entity, 数量: await count }))))
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  console.table(classes.map((course) => ({ 班课: course.name, 教师: course.teacher.name, 校区: course.campus.name,
    学员数: course.members.length, 每周: course.weekdays.map((weekday) => weekdays[weekday - 1]).join('、'),
    时间: `${course.startTime}–${course.endTime}`, 时区: course.campus.timezone })))
  console.table(vipSummaries)
  console.log(`已跳过 ${rejectedSlots} 个冲突候选时段；教室、教师和学员均使用同一占用表检查。`)
  console.log('排课约定：周一为每周起点；班课覆盖各校区当地今天前14日至后21日；已结束班课均已确认。')
  console.log('VIP 每包2次已确认、1次昨日待确认、4次预约；本周没有未来空档时顺延下周或再下一周。')
}

/** 供安装向导调用（不断开连接） */
export { main as seedDemo }

// 直接运行（npm run db:seed）时执行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().finally(() => prisma.$disconnect())
