/**
 * 开发用种子数据（全部为虚构演示数据）。
 * 运行：npm run db:reset -w server（清库 + 建表 + 种子）
 *
 * 演示账号（仅本地开发）：
 *   教职工  admin / admin123        超级管理员
 *           jw01 / 123456            教务
 *           sales01 / 123456         市场销售
 *           t01 ~ t04 / 123456       教师
 *           sw01 / 123456            事务
 *           demo / demo123456        只读管理员（演示：能看全部，不能修改）
 *   学生端  S2026001 ~ S2026006 / 123456
 */
import '../src/env'
import { prisma } from '../src/lib/prisma'
import { pathToFileURL } from 'node:url'
import bcrypt from 'bcryptjs'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ALL_PERMISSION_CODES } from '../src/permissions'

dayjs.extend(utc)
dayjs.extend(timezone)
const TZ = 'Asia/Tokyo'

const at = (dayOffset: number, hm: string) =>
  dayjs.tz(`${dayjs().tz(TZ).add(dayOffset, 'day').format('YYYY-MM-DD')} ${hm}`, 'YYYY-MM-DD HH:mm', TZ).toDate()

async function main() {
  if (await prisma.campus.count()) {
    console.log('数据库已有数据，跳过种子。如需重建请运行 npm run db:reset -w server')
    return
  }
  const pw = await bcrypt.hash('123456', 10)
  const adminPw = await bcrypt.hash('admin123', 10)
  const demoPw = await bcrypt.hash('demo123456', 10)

  // ---------- 校区 ----------
  const hq = await prisma.campus.create({ data: { code: 'TKY', name: '东京本部', address: '東京都板橋区', sort: 1 } })
  const tkb = await prisma.campus.create({ data: { code: 'TKB', name: '高田马场校', address: '東京都新宿区高田馬場', sort: 2 } })

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
  ])
  const rSales = await mkRole('市场销售', 'SELF', [
    'daily.write', 'crm.customer.view', 'crm.pool', 'crm.channel', 'student.enroll', 'student.view', 'student.edit',
    'order.view', 'order.pay', 'schedule.view', 'interview.manage',
  ])
  const rTeacher = await mkRole('教师', 'SELF', [
    'daily.write', 'wage.claim', 'teacher.students', 'schedule.view', 'schedule.own', 'attendance.manage', 'interview.manage', 'document.review',
  ])
  const rClerk = await mkRole('事务', 'CAMPUS', [
    'daily.write', 'student.all', 'order.all', 'order.pay', 'order.refund', 'product.manage', 'print.manage', 'notice.manage', 'file.manage', 'wage.review', 'schedule.view',
  ])
  void ALL_PERMISSION_CODES

  // ---------- 教职工 ----------
  const mkUser = (staffNo: string, name: string, identity: string, roleId: number, campusId: number, extra: object = {}, subjects: number[] = []) =>
    prisma.user.create({
      data: {
        staffNo, name, identity, campusId, passwordHash: staffNo === 'admin' ? adminPw : staffNo === 'demo' ? demoPw : pw,
        roles: { create: [{ roleId }] },
        subjects: { create: subjects.map((subjectId) => ({ subjectId })) },
        ...extra,
      },
    })
  const admin = await mkUser('admin', '系统管理员', 'STAFF', rAdmin.id, hq.id)
  await mkUser('demo', '演示账号（只读）', 'STAFF', rReadOnly.id, hq.id)
  const jw = await mkUser('jw01', '教务 山田', 'STAFF', rJw.id, hq.id)
  const sales = await mkUser('sales01', '销售 李明', 'STAFF', rSales.id, hq.id)
  await mkUser('sw01', '事务 佐藤', 'STAFF', rClerk.id, hq.id)
  const t1 = await mkUser('t01', '王老师', 'TEACHER', rTeacher.id, hq.id, { hourlyWage: 3000, transportFee: 400 }, [await subj('EJU日语'), await subj('JLPT')])
  const t2 = await mkUser('t02', '陈老师', 'TEACHER', rTeacher.id, hq.id, { hourlyWage: 3500, transportFee: 300 }, [await subj('EJU文综'), await subj('EJU文科数学')])
  const t3 = await mkUser('t03', '铃木老师', 'TEACHER', rTeacher.id, tkb.id, { hourlyWage: 3500 }, [await subj('大学院经济学'), await subj('大学院经营学')])
  const t4 = await mkUser('t04', '张老师', 'TEACHER', rTeacher.id, tkb.id, { hourlyWage: 3000 }, [await subj('设计'), await subj('日式素描')])
  void admin

  // ---------- 教室 ----------
  const rooms = [
    [hq.id, '4楼-401', '板桥', 'CLASS', 12, 1], [hq.id, '4楼-402', '板桥', 'CLASS', 12, 2], [hq.id, '4楼-VIP2', '板桥', 'VIP', 2, 3],
    [hq.id, '5楼-VIP1', '板桥', 'VIP', 2, 4], [hq.id, '5楼-501', '板桥', 'CLASS', 16, 5], [hq.id, '6楼-601', '板桥', 'CLASS', 20, 6],
    [hq.id, 'オンライン教室1', '线上', 'ONLINE', 100, 20], [hq.id, 'オンライン教室2', '线上', 'ONLINE', 100, 21],
    [tkb.id, '8楼-801', '高马', 'CLASS', 12, 7], [tkb.id, '8楼-802', '高马', 'CLASS', 12, 8], [tkb.id, '8楼-803画室', '高马', 'STUDIO', 10, 9],
    [tkb.id, '8楼-VIP4', '高马', 'VIP', 2, 11], [tkb.id, '8楼-VIP5', '高马', 'VIP', 2, 12],
  ] as const
  const roomIds: Record<string, number> = {}
  for (const [campusId, name, building, kind, capacity, s] of rooms) {
    const r = await prisma.room.create({ data: { campusId, name, building, kind, capacity, sort: s, allowVip: kind !== 'STUDIO' } })
    roomIds[name] = r.id
  }

  // ---------- 渠道 / 机构 ----------
  for (const [i, name] of ['渠道推荐', '渠道名单邀约', '语言学校说明会', '主动上门', '企宣&网络', '学员转介绍', '二次转化', '身边资源'].entries())
    await prisma.channel.create({ data: { name, sort: i + 1 } })
  const ch = await prisma.channel.findFirstOrThrow({ where: { name: '企宣&网络' } })
  const org = await prisma.organization.create({
    data: { campusId: hq.id, name: '示例日语学校（成都）', type: '日语学校', province: '四川省', city: '成都市', contactName: '刘老师', rebateRule: '一对一15% 班课20%', rebateRateClass: 0.2, rebateRateVip: 0.15, status: 'ACTIVE', ownerId: sales.id, signedAt: new Date() },
  })

  // ---------- 课程产品 ----------
  const singles = ['6月留考对策日语课', '6月留考对策综合科', '6月留考对策文科数学', '校内考小论文课程', '大学院经济学专业课', '进学指导课程']
  const singleIds: number[] = []
  for (const [i, name] of singles.entries())
    singleIds.push((await prisma.courseProduct.create({ data: { type: 'SINGLE', name, price: 50000 + i * 10000, campusId: hq.id, sort: i } })).id)
  const pkg = await prisma.courseProduct.create({
    data: { type: 'PACKAGE', name: '学部文科通年套餐', price: 580000, originalPrice: 760000, category: '学部文科', campusId: hq.id, packageItems: { create: singleIds.slice(0, 4).map((productId) => ({ productId })) } },
  })
  await prisma.courseProduct.create({
    data: { type: 'PACKAGE', name: '大学院文科半年套餐 + VIP 20h', price: 480000, originalPrice: 620000, category: '大学院文科', vipHours: 20, campusId: hq.id, packageItems: { create: singleIds.slice(4).map((productId) => ({ productId })) } },
  })

  // ---------- 学员 ----------
  const stuData = [
    ['S2026001', '刘一', '普通高中', '学部文科', 'ABC日本語学校'],
    ['S2026002', '赵二', '本科', '大学院文科', '东京国际日本语学院'],
    ['S2026003', '孙三', '普通高中国际部', '学部文科', 'ABC日本語学校'],
    ['S2026004', '周四', '本科', '大学院美术', '新宿日本语学校'],
    ['S2026005', '吴五', '国际高中', '学部理科', '东京国际日本语学院'],
    ['S2026006', '郑六', '本科', '大学院文科', '新宿日本语学校'],
  ] as const
  const students = []
  for (const [i, [studentNo, name, education, subjectCategory, languageSchool]] of stuData.entries()) {
    students.push(
      await prisma.student.create({
        data: {
          campusId: i < 4 ? hq.id : tkb.id, studentNo, name, education, subjectCategory, languageSchool,
          gender: i % 2 ? 'F' : 'M', salesId: sales.id, mainTeacherId: i % 2 ? t2.id : t1.id, contractTeacherId: t1.id,
          channelId: ch.id, organizationId: i === 0 ? org.id : null, enrollTerm: '2026年4月', portalPasswordHash: pw,
        },
      }),
    )
  }
  await prisma.studentExam.createMany({
    data: [
      { studentId: students[0].id, examType: 'JLPT', level: 'N1', score: 132, examDate: new Date('2025-12-07') },
      { studentId: students[0].id, examType: 'EJU', attempt: 1, examDate: new Date('2026-06-21'), score: 670, scores: JSON.stringify({ japanese: 320, writing: 40, general: 150, math1: 160 }) },
    ],
  })
  await prisma.studentAdmission.create({ data: { studentId: students[1].id, sort: 1, university: '早稲田大学', faculty: '経済学研究科', department: '経済学専攻', major: '応用経済' } })

  // 订单
  await prisma.order.create({
    data: {
      orderNo: 'SO2026000001', studentId: students[0].id, campusId: hq.id, salesId: sales.id, packageId: pkg.id, classMode: 'BOTH', vipHours: 20, vipContent: 'EJU 日语一对一',
      listAmount: 760000, discountAmount: 180000, discountReason: '学费折扣', payableAmount: 580000, paidAmount: 300000, status: 'PARTIAL',
      items: { create: [{ productId: pkg.id, name: pkg.name, price: 580000 }] },
      payments: { create: [{ amount: 300000, method: '银行转账', paidAt: new Date(), payeeId: sales.id }] },
    },
  })

  // 客户
  const cust = [
    ['钱七', 'A', 'FOLLOWING', sales.id], ['冯八', 'B', 'NEW', sales.id], ['陈九', 'C', 'NEW', null], ['褚十', 'D', 'LOST', null],
  ] as const
  for (const [name, intentLevel, status, ownerId] of cust) {
    const c = await prisma.customer.create({
      data: { campusId: hq.id, name, intentLevel, status, ownerId, channelId: ch.id, education: '本科', subjectCategory: '大学院文科', source: '线上咨询', assignedAt: ownerId ? new Date() : null },
    })
    if (ownerId) await prisma.followUp.create({ data: { customerId: c.id, userId: ownerId, method: '微信', content: '初次沟通，介绍大学院文科课程', intentLevel } })
  }

  // ---------- 班课 + 本周课次 ----------
  const cls = await prisma.classGroup.create({
    data: { campusId: hq.id, name: '6月留考日语对策A班', subject: 'EJU日语', teacherId: t1.id, defaultRoomId: roomIds['4楼-401'], productId: singleIds[0], students: { create: students.slice(0, 3).map((s) => ({ studentId: s.id })) } },
  })
  const series = await prisma.sessionSeries.create({
    data: { startDate: dayjs().tz(TZ).format('YYYY-MM-DD'), endDate: dayjs().tz(TZ).add(13, 'day').format('YYYY-MM-DD'), weekdays: '1,3,5', startTime: '10:00', endTime: '12:00', createdById: jw.id },
  })
  for (let d = 0; d < 14; d++) {
    const wd = ((dayjs().tz(TZ).add(d, 'day').day() + 6) % 7) + 1 // 1=周一 … 7=周日
    if (![1, 3, 5].includes(wd)) continue
    await prisma.session.create({
      data: { campusId: hq.id, kind: 'CLASS', title: cls.name, roomId: roomIds['4楼-401'], teacherId: t1.id, classGroupId: cls.id, seriesId: series.id, startAt: at(d, '10:00'), endAt: at(d, '12:00'), createdById: jw.id },
    })
  }

  // ---------- VIP 课时包 ----------
  const vip = await prisma.vipPackage.create({
    data: { studentId: students[1].id, name: '大学院经济一对一', subject: '大学院经济学', totalHours: 20, usedHours: 2, pendingHours: 4, teachers: { create: [{ teacherId: t3.id }] } },
  })
  await prisma.session.createMany({
    data: [
      { campusId: tkb.id, kind: 'VIP', title: `VIP ${students[1].name}`, roomId: roomIds['8楼-VIP4'], teacherId: t3.id, vipPackageId: vip.id, startAt: at(-3, '14:00'), endAt: at(-3, '16:00'), hours: 2, status: 'CONFIRMED', confirmedAt: at(-2, '10:00'), confirmedBy: 'STUDENT' },
      { campusId: tkb.id, kind: 'VIP', title: `VIP ${students[1].name}`, roomId: roomIds['8楼-VIP4'], teacherId: t3.id, vipPackageId: vip.id, startAt: at(-1, '14:00'), endAt: at(-1, '16:00'), hours: 2 },
      { campusId: tkb.id, kind: 'VIP', title: `VIP ${students[1].name}`, roomId: roomIds['8楼-VIP4'], teacherId: t3.id, vipPackageId: vip.id, startAt: at(2, '14:00'), endAt: at(2, '16:00'), hours: 2 },
    ],
  })

  // ---------- 成绩管理：三次 EJU 文科模考（班课学员 + 2 名其他学员） ----------
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
  const takers = students.slice(0, 5)
  for (const [n, [ago, kind]] of ([[70, 'EJU 模考'], [42, 'EJU 模考'], [14, 'EJU 模考']] as const).entries()) {
    await prisma.assessment.create({
      data: {
        campusId: hq.id,
        name: `EJU 文科模考 第${n + 1}回`,
        kind,
        examDate: dayjs().tz(TZ).subtract(ago, 'day').startOf('day').toDate(),
        classGroupId: n === 2 ? cls.id : null,
        subjects: JSON.stringify(mockConf),
        published: n < 2,
        createdById: t1.id,
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

  // ---------- 通知 ----------
  await prisma.notice.createMany({
    data: [
      { title: '2026-2027 年末年始放假通知', content: '<p>12月28日至1月4日放假，期间教室不可预约。</p>', audience: 'ALL', authorId: jw.id, pinned: true },
      { title: '【重要】课程反馈改版通知', content: '<p>VIP 课时改为下课 48 小时后自动确认。</p>', audience: 'STAFF', authorId: jw.id },
    ],
  })
  void t4
  console.log('种子数据已写入。')
}

/** 供安装向导调用（不断开连接） */
export { main as seedDemo }

// 直接运行（npm run db:seed）时执行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().finally(() => prisma.$disconnect())
