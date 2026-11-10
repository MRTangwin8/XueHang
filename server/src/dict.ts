/**
 * 业务字典：所有 String 型「枚举」字段的取值。
 * 前端通过 GET /api/common/dicts 获取，用 <DictSelect dict="educations" /> 渲染。
 * 形如 { value, label } 的条目：value 存库，label 显示；纯字符串数组则值即显示。
 */
type Opt = { value: string; label: string; color?: string }
const opts = (pairs: [string, string, string?][]): Opt[] => pairs.map(([value, label, color]) => ({ value, label, color }))

export const DICTS = {
  // ---- 通用 ----
  genders: opts([['M', '男'], ['F', '女']]),
  currencies: opts([['JPY', '日元'], ['CNY', '人民币']]),
  audiences: opts([['STAFF', '教职工'], ['STUDENT', '学生'], ['ALL', '全部']]),
  userIdentities: opts([['TEACHER', '教师'], ['STAFF', '职工'], ['OTHER', '其他']]),
  userStatuses: opts([['ACTIVE', '在职'], ['LOCKED', '锁定']]),
  dataScopes: opts([['SELF', '仅本人'], ['CAMPUS', '本校区'], ['ALL', '全部']]),

  // ---- 学员档案（默认为日本升学私塾模板，可在后台修改或导入其他行业模板）----
  educations: ['初中', '中专', '大专', '普通高中', '国际高中', '普通高中国际部', '专门学校', '本科'],
  subjectCategories: [
    '学部文科', '学部理科', '大学院文科', '大学院理科',
    '学部美术', '大学院美术', '学部音乐', '大学院音乐',
    '建筑', '国际部', '日本高中', '日语', '英语',
  ],
  targetDegrees: ['学部', '研究生', '修士', '博士'],
  studentStatuses: opts([['ENROLLED', '在籍', 'success'], ['SUSPENDED', '休学', 'warning'], ['GRADUATED', '结业', 'info'], ['LEFT', '退学', 'danger']]),
  visaStatuses: ['留学', '家族滞在', '永住', '定住', '日本国籍', '短期滞在', '其他'],

  // ---- CRM ----
  customerStatuses: opts([['NEW', '新客户', 'primary'], ['FOLLOWING', '跟进中', 'warning'], ['SIGNED', '已签约', 'success'], ['LOST', '已流失', 'info']]),
  intentLevels: opts([['A', 'A 强烈', 'danger'], ['B', 'B 较强', 'warning'], ['C', 'C 一般', 'primary'], ['D', 'D 较弱', 'info']]),
  customerSources: ['线上咨询', '到访', '电话', '转介绍', '说明会', '其他'],
  followMethods: ['电话', '微信', 'QQ', '到访面谈', '线上会议', '邮件', '其他'],
  organizationTypes: ['日语学校', '留学中介', '高校', '个人', '其他'],
  organizationStatuses: opts([['POTENTIAL', '洽谈中', 'warning'], ['ACTIVE', '合作中', 'success'], ['PAUSED', '暂停', 'info']]),

  // ---- 订单 ----
  productTypes: opts([['SINGLE', '单期课程'], ['PACKAGE', '私塾套餐']]),
  classModes: opts([['CLASS', '班课'], ['VIP', 'VIP'], ['BOTH', '班课+VIP']]),
  orderStatuses: opts([['UNPAID', '未缴费', 'danger'], ['PARTIAL', '部分缴费', 'warning'], ['PAID', '已缴清', 'success'], ['REFUNDED', '已退费', 'info'], ['CANCELLED', '已作废', 'info']]),
  paymentKinds: ['报名缴费', '报名缴费补款', '购买教材', '加急修改志望理由', '加急修改研究计划', '其他'],
  paymentMethods: ['现金', '银行转账', '微信支付', '支付宝', '信用卡', '其他'],
  discountReasons: ['合作校优惠', '老生新报', '学费折扣', '优惠券', '优秀学生免费课程', '其他'],

  // ---- 教务 ----
  roomKinds: opts([['CLASS', '班课教室'], ['VIP', 'VIP 教室'], ['ONLINE', '线上教室'], ['STUDIO', '画室']]),
  sessionKinds: opts([['CLASS', '班课', '#409eff'], ['VIP', 'VIP', '#e6a23c'], ['OTHER', '其他占用', '#909399']]),
  sessionStatuses: opts([['SCHEDULED', '待确认', 'warning'], ['CONFIRMED', '已确认', 'success'], ['CANCELLED', '已取消', 'info']]),
  weekdays: opts([['1', '周一'], ['2', '周二'], ['3', '周三'], ['4', '周四'], ['5', '周五'], ['6', '周六'], ['7', '周日']]),
  attendanceStatuses: opts([['PRESENT', '出勤', 'success'], ['ABSENT', '缺席', 'danger'], ['LEAVE', '请假', 'info'], ['LATE', '迟到', 'warning'], ['EARLY_LEAVE', '早退', 'warning']]),
  vipStatuses: opts([['ACTIVE', '在读', 'success'], ['FINISHED', '结业', 'info']]),

  // ---- 教学服务 ----
  interviewKinds: opts([['CONSULT', '面谈预约'], ['EXAM', '面试预约']]),
  slotStatuses: opts([['OPEN', '可预约', 'success'], ['BOOKED', '已预约', 'warning'], ['DONE', '已完成', 'info'], ['CANCELLED', '已取消', 'info']]),
  docTypes: ['研究计划书', '志望理由书', '自我推荐书', '小论文', '其他'],
  docStatuses: opts([['SUBMITTED', '待分配', 'danger'], ['ASSIGNED', '批改中', 'warning'], ['RETURNED', '已返还', 'success']]),
  printColorModes: opts([['BW', '黑白单面'], ['COLOR', '彩色单面']]),
  printStatuses: opts([['PENDING', '待打印', 'warning'], ['PRINTED', '可领取', 'success'], ['PICKED_UP', '已领取', 'info'], ['CANCELLED', '已取消', 'info']]),
  wageCategories: ['授课', '办公', '面谈', '文书', '其他'],

  // ---- 成绩管理 ----
  assessmentKinds: ['小测', '单元测验', 'EJU 模考', 'JLPT 模考', '校内考试', '其他'],
  wageStatuses: opts([['PENDING', '待审核', 'warning'], ['APPROVED', '已通过', 'success'], ['REJECTED', '未通过', 'danger']]),
} as const

/** 资料打印：文件类型 → 允许的扩展名 */
export const PRINT_TYPE_EXTS: Record<string, string[]> = {
  pdf: ['.pdf'], jpg: ['.jpg', '.jpeg'], png: ['.png'], word: ['.doc', '.docx'], excel: ['.xls', '.xlsx'], ppt: ['.ppt', '.pptx'],
}
export const PORTAL_MODULES = ['timetable', 'grades', 'vip', 'interviews', 'documents', 'prints'] as const

export type DictKey = keyof typeof DICTS

/** 业务常量 */
/**
 * 业务规则（默认值）。运行时由「系统设置 → 业务规则」覆盖（lib/rules.ts 启动时及保存后原地更新本对象），
 * 因此各模块继续直接读取 RULES.xxx 即可拿到最新值。
 */
export const DEFAULT_RULES = {
  // ---- VIP 课时 ----
  /** 是否在下课后自动确认 VIP 课时 */
  vipAutoConfirmEnabled: true,
  /** 下课后多少小时自动确认 */
  vipAutoConfirmHours: 48,
  /** 学生端能否自行确认课时 */
  vipStudentConfirm: true,
  /** VIP 课次必须先填写课堂记录才能确认（教职工确认、学生确认、自动确认都受此限制） */
  vipRecordRequired: false,
  // ---- 面谈 / 面试 ----
  /** 开始前多少小时内不可取消 */
  interviewCancelLockHours: 8,
  /** 自定义预约确认提示（空 = 使用默认文案，按界面语言显示） */
  interviewConfirmText: '',
  // ---- 文书修改 ----
  /** 提交后可修改窗口（小时）、可修改次数、返还期限（天） */
  documentEditHours: 24,
  documentMaxEdits: 1,
  documentReturnDays: 7,
  /** 自定义规则说明（空 = 使用默认说明） */
  documentRulesText: '',
  // ---- 资料打印 ----
  /** 打印单价（每张，单位见 printCurrency） */
  printPriceBW: 10,
  printPriceColor: 50,
  /** 截止时刻 / 可领取时刻（校区时区，HH:mm） */
  printCutoff: '12:00',
  printReadyTime: '17:00',
  /** 自定义打印使用说明（空 = 使用默认说明） */
  printGuideText: '',
  // ---- 货币 / 单位 ----
  /** 打印费的货币：JPY / CNY，或自定义文字（如「港币」「元」） */
  printCurrency: 'JPY',
  /** 工资（时薪、交通费、工资申报）的货币：JPY / CNY，或自定义文字 */
  wageCurrency: 'JPY',
  // ---- 学员档案 ----
  /** 合格信息最多条数（考试类型、回数、考试月份见「成绩与档案设置」） */
  maxAdmissions: 5,
  // ---- 排课看板 ----
  boardStartHour: 8,
  boardEndHour: 22,
  /** 排课时必须选择教室（关闭后允许不分配教室，如线上课、外出活动） */
  sessionRoomRequired: true,
  // ---- 客户公海 ----
  /** 是否自动回收长期未跟进的客户到公海 */
  customerRecycleEnabled: false,
  /** 多少天没有跟进则回收（以最近跟进时间为准，从未跟进的以分配时间为准） */
  customerRecycleDays: 30,
  // ---- 编号与上传 ----
  /** 学号前缀（后接年份与序号，如 S2026001） */
  studentNoPrefix: 'S',
  /** 订单号前缀（后接年份与序号，如 SO2026000001） */
  orderNoPrefix: 'SO',
  /** 单个上传文件大小上限（MB） */
  uploadMaxMB: 20,
  // ---- 登录安全 ----
  /** 同一账号连续失败多少次锁定；同一 IP 失败多少次锁定；锁定分钟数；登录有效天数 */
  /** 是否启用登录失败锁定（关闭后不限制失败次数，并立即解除已有的锁定；只建议临时关闭） */
  loginLockEnabled: true,
  loginMaxFailures: 5,
  loginIpMaxFailures: 30,
  loginLockMinutes: 15,
  sessionDays: 3,
  // ---- 学生端 ----
  /** 学生端开放的功能（首页、通知、资料始终开放）：timetable 我的课表 / grades 我的成绩 / vip 我的课时 / interviews 面谈预约 / documents 文书修改 / prints 资料打印 */
  portalModules: ['timetable', 'grades', 'vip', 'interviews', 'documents', 'prints'] as string[],
  /** 学生端「我的成绩」是否显示名次 / 平均分 / 最好得分率 */
  portalGradeShowRank: true,
  portalGradeShowAverage: true,
  portalGradeShowBest: true,
  // ---- 资料打印可上传的文件类型：pdf / jpg / png / word / excel / ppt ----
  printFileTypes: ['pdf', 'jpg'] as string[],
  // ---- 课表导出图片 ----
  /** 标题（空 = 「{name} 课表」；可用 {name} {studentNo} {from} {to} {site}） */
  timetableExportTitle: '',
  /** 页脚说明（空 = 不显示） */
  timetableExportFooter: '',
  timetableExportShowTeacher: true,
  timetableExportShowRoom: true,
  // ---- 演示 ----
  /** 只读（演示）账号可以排课、改课、取消课次（公开演示站让访客试用排课；其他数据仍然只读） */
  readOnlyCanSchedule: false,
}
export type Rules = typeof DEFAULT_RULES

/** 当前生效的业务规则（可变对象，勿整体替换） */
export const RULES: Rules = structuredClone(DEFAULT_RULES)

/** 可在后台维护的下拉选项（纯选项，业务逻辑不依赖具体取值）。状态类字典不在此列 */
export const EDITABLE_DICTS = [
  'educations', 'subjectCategories', 'targetDegrees', 'visaStatuses',
  'customerSources', 'followMethods', 'organizationTypes',
  'paymentKinds', 'paymentMethods', 'discountReasons',
  'docTypes', 'wageCategories', 'assessmentKinds',
] as const
export type EditableDictKey = (typeof EDITABLE_DICTS)[number]

/** 被「隐藏」的选项：仍是合法值（历史数据可继续保存），但新表单中不再显示 */
export const DICT_HIDDEN: Partial<Record<EditableDictKey, string[]>> = {}

