/**
 * 行业模板数据（纯数据，不访问数据库；安装向导在建库前即可读取）。
 * 导入逻辑见 presets.ts。
 */
import { DICTS, EDITABLE_DICTS, type EditableDictKey } from '../dict'
import type { EduConfig, ExamTypeDef, FieldConf, GradeTemplate, ProfileField, SubjectDef } from './educonfig'

export interface Preset {
  id: string
  name: string
  description: string
  edu: Omit<EduConfig, 'preset'>
  dicts: Partial<Record<EditableDictKey, string[]>>
  /** 教授课程：分类 → 课程名 */
  subjects: Record<string, string[]>
}

export const PRESET_PARTS = ['exams', 'grades', 'profile', 'dicts', 'subjects'] as const
export type PresetPart = (typeof PRESET_PARTS)[number]

// ------------------------------------------------------------------
// 构造工具
// ------------------------------------------------------------------
const sub = (key: string, name: string, max: number, extra: Partial<SubjectDef> = {}): SubjectDef => ({ key, name, max, ...extra })
export const exam = (e: Partial<ExamTypeDef> & Pick<ExamTypeDef, 'code' | 'name'>): ExamTypeDef => ({
  group: '',
  levels: [],
  scoreMax: null,
  scoreStep: 1,
  subjects: [],
  totalMode: 'sum',
  maxAttempts: 1,
  months: [],
  hidden: false,
  ...e,
})
const tpl = (id: string, name: string, subjects: SubjectDef[], totalMode: GradeTemplate['totalMode'] = 'sum', scoreStep = 1): GradeTemplate => ({
  id,
  name,
  subjects,
  totalMode,
  scoreStep,
})
const single = tpl('single', '单科测验', [sub('score', '成绩', 100)])

// 内置默认字典（导入时 DICTS 尚未被后台设置覆盖）
const BUILTIN_DICTS = Object.fromEntries(EDITABLE_DICTS.map((k) => [k, [...(DICTS[k] as readonly string[])]])) as Record<EditableDictKey, string[]>
const pick = (o: Record<EditableDictKey, string[]>, keys: EditableDictKey[]) => Object.fromEntries(keys.map((k) => [k, o[k]])) as Partial<Record<EditableDictKey, string[]>>

const EJU_SUBJECTS = [
  sub('japanese', '日语', 400, { highlight: true }),
  sub('writing', '记述', 50),
  sub('general', '综合科目', 200),
  sub('math1', '数学1', 200),
  sub('math2', '数学2', 200),
  sub('physics', '物理', 100),
  sub('chemistry', '化学', 100),
  sub('biology', '生物', 100),
]
const JLPT_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5']
const jlpt = (withSections: boolean) =>
  exam({
    code: 'JLPT',
    name: '日语能力考试 JLPT',
    group: '语言能力',
    levels: JLPT_LEVELS,
    scoreMax: 180,
    months: [7, 12],
    subjects: withSections ? [sub('vocab', '言语知识', 60), sub('reading', '读解', 60), sub('listening', '听解', 60)] : [],
    maxAttempts: withSections ? 6 : 1,
  })
const ielts = exam({
  code: 'IELTS', name: '雅思 IELTS', group: '英语能力', scoreMax: 9, scoreStep: 0.5, totalMode: 'avg', maxAttempts: 6,
  subjects: [sub('listening', '听力', 9), sub('reading', '阅读', 9), sub('writing', '写作', 9), sub('speaking', '口语', 9)],
})
const toefl = exam({
  code: 'TOEFL', name: '托福 TOEFL', group: '英语能力', scoreMax: 120, maxAttempts: 6,
  subjects: [sub('reading', '阅读', 30), sub('listening', '听力', 30), sub('speaking', '口语', 30), sub('writing', '写作', 30)],
})
const toeic = exam({
  code: 'TOEIC', name: '托业 TOEIC', group: '英语能力', scoreMax: 990, scoreStep: 5, maxAttempts: 6,
  subjects: [sub('listening', '听力', 495), sub('reading', '阅读', 495)],
})
const other = (hidden = true) => exam({ code: 'OTHER', name: '其他证书 / 竞赛', group: '其他', maxAttempts: 10, hidden })

const f = (o: Partial<Record<ProfileField, FieldConf>>) => o

// ------------------------------------------------------------------
// 模板
// ------------------------------------------------------------------
export const PRESETS: Preset[] = [
  {
    id: 'jp-juku',
    name: '日本升学私塾',
    description: '面向赴日留学生的升学辅导：JLPT / EJU（多回、分科）/ 英语考试，学部·大学院志望与合格校管理。',
    edu: {
      examTypes: [
        jlpt(false),
        exam({ code: 'EJU', name: 'EJU 日本留学考试', group: '升学考试', subjects: EJU_SUBJECTS, maxAttempts: 3, months: [6, 11] }),
        exam({ code: 'TOEFL', name: '托福 TOEFL', group: '英语能力', scoreMax: 120 }),
        exam({ code: 'TOEIC', name: '托业 TOEIC', group: '英语能力', scoreMax: 990, scoreStep: 5 }),
        exam({ code: 'IELTS', name: '雅思 IELTS', group: '英语能力', scoreMax: 9, scoreStep: 0.5 }),
        other(),
      ],
      gradeTemplates: [
        tpl('eju-arts', 'EJU 文科模考', [sub('japanese', '日语', 400), sub('writing', '记述', 50), sub('general', '综合科目', 200), sub('math1', '数学1', 200)]),
        tpl('eju-science', 'EJU 理科模考', [sub('japanese', '日语', 400), sub('writing', '记述', 50), sub('math2', '数学2', 200), sub('physics', '物理', 100), sub('chemistry', '化学', 100)]),
        tpl('jlpt', 'JLPT 模考', [sub('vocab', '言语知识', 60, { pass: 19 }), sub('reading', '读解', 60, { pass: 19 }), sub('listening', '听解', 60, { pass: 19 })]),
        single,
      ],
      profileFields: {},
    },
    dicts: pick(BUILTIN_DICTS, ['educations', 'subjectCategories', 'targetDegrees', 'visaStatuses', 'docTypes', 'assessmentKinds']),
    subjects: {
      EJU: ['EJU日语', 'EJU文综', 'EJU文科数学', 'EJU生物', 'EJU物理', 'EJU化学', 'EJU理科数学'],
      语言与通识: ['JLPT', 'MBA', '英语', '国语', '世界史', '日本史'],
      TA: ['学部文科TA', '学部理科TA', '大学院文科TA', '大学院理科TA', '学部美术TA', '大学院美术TA'],
      大学院文科: ['大学院日本语教育学', '大学院教育学', '大学院经济学', '大学院经营学', '大学院国际关系学', '大学院社会学', '大学院传媒'],
      大学院理科: ['大学院电子电气', '大学院高数', '大学院情报', '大学院土木工程', '大学院生物', '大学院建筑'],
      美术: ['设计', '纯艺', 'ACG', '日式素描', '服装', '映像写真', '作品集排版'],
    },
  },
  {
    id: 'cn-k12',
    name: '中国中小学培训机构',
    description: '小学 / 初中 / 高中学科辅导：语数外及理化生政史地，月考、期中期末、中考高考成绩跟踪。',
    edu: {
      examTypes: [
        exam({
          code: 'ZHONGKAO', name: '中考', group: '升学考试', months: [6],
          subjects: [sub('chinese', '语文', 120), sub('math', '数学', 120), sub('english', '英语', 120), sub('physics', '物理', 100), sub('chemistry', '化学', 100), sub('politics', '道德与法治', 100), sub('history', '历史', 100)],
        }),
        exam({
          code: 'GAOKAO', name: '高考', group: '升学考试', months: [6],
          subjects: [
            sub('chinese', '语文', 150), sub('math', '数学', 150), sub('english', '英语', 150),
            sub('physics', '物理', 100), sub('chemistry', '化学', 100), sub('biology', '生物', 100),
            sub('politics', '政治', 100), sub('history', '历史', 100), sub('geography', '地理', 100),
          ],
        }),
        exam({ code: 'CAMBRIDGE', name: '剑桥英语 KET / PET', group: '英语能力', levels: ['KET', 'PET', 'FCE'], scoreMax: 230, maxAttempts: 3 }),
        exam({ code: 'CONTEST', name: '学科竞赛', group: '其他', levels: ['国家级', '省级', '市级', '区级'], maxAttempts: 10 }),
      ],
      gradeTemplates: [
        tpl('primary', '小学语数英', [sub('chinese', '语文', 100), sub('math', '数学', 100), sub('english', '英语', 100)]),
        tpl('junior', '初中五科', [sub('chinese', '语文', 120), sub('math', '数学', 120), sub('english', '英语', 120), sub('physics', '物理', 100), sub('chemistry', '化学', 100)]),
        tpl('senior-science', '高中（物化生）', [sub('chinese', '语文', 150), sub('math', '数学', 150), sub('english', '英语', 150), sub('physics', '物理', 100), sub('chemistry', '化学', 100), sub('biology', '生物', 100)]),
        tpl('senior-arts', '高中（政史地）', [sub('chinese', '语文', 150), sub('math', '数学', 150), sub('english', '英语', 150), sub('politics', '政治', 100), sub('history', '历史', 100), sub('geography', '地理', 100)]),
        single,
      ],
      profileFields: f({
        nameAlt: { hidden: true },
        visaStatus: { hidden: true },
        arrivedAt: { hidden: true },
        phoneCn: { label: '家长电话' },
        emergency: { label: '监护人' },
        education: { label: '年级', required: true },
        languageSchool: { label: '就读学校', required: true },
        subjectCategory: { label: '辅导类型' },
        graduatedSchool: { hidden: true },
        graduatedMajor: { hidden: true },
        graduatedAt: { hidden: true },
        targetUniversity: { label: '目标学校' },
        targetMajor: { hidden: true },
        targetDegree: { label: '升学目标' },
        researchTheme: { hidden: true },
        admissions: { label: '升学结果' },
      }),
    },
    dicts: {
      educations: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三', '其他'],
      subjectCategories: ['全科辅导', '单科辅导', '培优', '竞赛', '艺术素养', '编程科技'],
      targetDegrees: ['小升初', '中考', '高考', '竞赛', '其他'],
      docTypes: ['作文', '周记', '读书笔记', '其他'],
      assessmentKinds: ['课堂小测', '单元测试', '月考', '期中考试', '期末考试', '模拟考试', '入学测试', '其他'],
    },
    subjects: {
      小学: ['小学语文', '小学数学', '小学英语'],
      初中: ['初中语文', '初中数学', '初中英语', '初中物理', '初中化学'],
      高中: ['高中语文', '高中数学', '高中英语', '高中物理', '高中化学', '高中生物', '高中政治', '高中历史', '高中地理'],
      素质拓展: ['编程', '书法', '美术', '口才'],
    },
  },
  {
    id: 'language',
    name: '语言培训机构',
    description: '雅思 / 托福 / 托业 / 四六级 / 日语及小语种：分项成绩（含雅思均分算法）、多次考试、模考分析。',
    edu: {
      examTypes: [
        ielts,
        toefl,
        toeic,
        exam({ code: 'CET4', name: '大学英语四级 CET-4', group: '英语能力', scoreMax: 710, months: [6, 12], maxAttempts: 6, subjects: [sub('listening', '听力', 248.5), sub('reading', '阅读', 248.5), sub('writing', '写作与翻译', 213)] }),
        exam({ code: 'CET6', name: '大学英语六级 CET-6', group: '英语能力', scoreMax: 710, months: [6, 12], maxAttempts: 6, subjects: [sub('listening', '听力', 248.5), sub('reading', '阅读', 248.5), sub('writing', '写作与翻译', 213)] }),
        jlpt(true),
        other(false),
      ],
      gradeTemplates: [
        tpl('ielts', '雅思模考', [sub('listening', '听力', 9), sub('reading', '阅读', 9), sub('writing', '写作', 9), sub('speaking', '口语', 9)], 'avg', 0.5),
        tpl('toefl', '托福模考', [sub('reading', '阅读', 30), sub('listening', '听力', 30), sub('speaking', '口语', 30), sub('writing', '写作', 30)]),
        tpl('toeic', '托业模考', [sub('listening', '听力', 495), sub('reading', '阅读', 495)]),
        tpl('jlpt', 'JLPT 模考', [sub('vocab', '言语知识', 60, { pass: 19 }), sub('reading', '读解', 60, { pass: 19 }), sub('listening', '听解', 60, { pass: 19 })]),
        single,
      ],
      profileFields: f({
        nameAlt: { label: '英文名' },
        visaStatus: { hidden: true },
        arrivedAt: { hidden: true },
        languageSchool: { label: '所在学校 / 单位' },
        subjectCategory: { label: '课程方向' },
        targetDegree: { label: '学习目的' },
        researchTheme: { hidden: true },
        admissions: { label: '录取 / 成果' },
      }),
    },
    dicts: {
      educations: ['初中', '高中', '中专', '大专', '本科', '硕士', '博士', '其他'],
      subjectCategories: ['雅思', '托福', '托业', '四六级', '日语', '韩语', '法语', '德语', '西班牙语', '少儿英语', '商务英语'],
      targetDegrees: ['留学', '升学', '求职', '移民', '兴趣'],
      docTypes: ['作文', '个人陈述', '推荐信', '简历', '其他'],
      assessmentKinds: ['入学分级测试', '课堂测验', '阶段测试', '全真模考', '结课考试', '其他'],
    },
    subjects: {
      英语: ['雅思听力', '雅思阅读', '雅思写作', '雅思口语', '托福', '托业', '四六级', '少儿英语', '商务英语'],
      小语种: ['日语', '韩语', '法语', '德语', '西班牙语'],
    },
  },
  {
    id: 'general',
    name: '通用培训机构（精简）',
    description: '职业技能、兴趣培训等：精简档案字段，通用证书记录与理论 / 实操考核。',
    edu: {
      examTypes: [exam({ code: 'CERT', name: '证书 / 等级考试', group: '证书', maxAttempts: 10 })],
      gradeTemplates: [tpl('theory-practice', '理论 + 实操', [sub('theory', '理论', 100), sub('practice', '实操', 100)]), single],
      profileFields: f({
        nameAlt: { hidden: true },
        phoneCn: { hidden: true },
        qq: { hidden: true },
        visaStatus: { hidden: true },
        arrivedAt: { hidden: true },
        graduatedMajor: { hidden: true },
        graduatedAt: { hidden: true },
        languageSchool: { label: '所在学校 / 单位' },
        subjectCategory: { label: '课程方向' },
        targetUniversity: { hidden: true },
        targetMajor: { hidden: true },
        targetDegree: { hidden: true },
        researchTheme: { hidden: true },
        admissions: { hidden: true },
      }),
    },
    dicts: {
      educations: ['初中', '高中', '中专', '大专', '本科', '硕士', '博士', '其他'],
      subjectCategories: ['基础班', '提高班', '精品班', '一对一'],
      assessmentKinds: ['课堂测验', '阶段考核', '结课考核', '其他'],
    },
    subjects: { 通用: ['基础课程', '进阶课程', '一对一辅导'] },
  },
]

export const DEFAULT_PRESET = 'jp-juku'
export const findPreset = (id: string) => PRESETS.find((p) => p.id === id)


/** 模板摘要（给前端预览） */
export function presetSummaries() {
  return PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    examTypes: p.edu.examTypes.filter((e) => !e.hidden).map((e) => e.name),
    gradeTemplates: p.edu.gradeTemplates.map((t) => t.name),
    dicts: p.dicts,
    subjects: p.subjects,
    profileFields: p.edu.profileFields,
  }))
}

