/**
 * 行业模板导入：一键写入考试类型、成绩模板、档案字段、下拉选项与教授课程。
 * 安装向导与「系统设置 → 行业模板」共用。
 *
 * 导入规则（不破坏历史数据）：
 *   - 考试类型 / 成绩模板 / 档案字段：替换为模板内容；已有学员成绩在用、但模板里没有的考试类型保留为「隐藏」
 *   - 下拉选项：模板选项排在前面并显示；原有但模板里没有的选项保留为「隐藏」（历史数据仍可显示）
 *   - 教授课程：只新增模板中缺少的课程，不删除、不停用已有课程
 */
import { DICTS, type EditableDictKey } from '../dict'
import type { Tx } from './prisma'
import { prisma } from './prisma'
import { badRequest } from './errors'
import { EDU, examCodesInUse, writeEdu, type EduConfig } from './educonfig'
import { applyDictConfig, readDictConfig } from './rules'
import { PRESET_PARTS, exam, findPreset, type PresetPart } from './presets-data'

export * from './presets-data'

/** 写入教授课程（只新增） */
export async function addPresetSubjects(tx: Tx | typeof prisma, subjects: Record<string, string[]>) {
  const max = await tx.teachingSubject.aggregate({ _max: { sort: true } })
  let sort = (max._max.sort ?? 0) + 1
  let added = 0
  for (const [category, names] of Object.entries(subjects))
    for (const name of names) {
      const exists = await tx.teachingSubject.findUnique({ where: { name } })
      if (exists) continue
      await tx.teachingSubject.create({ data: { name, category, sort: sort++ } })
      added++
    }
  return added
}

/** 导入行业模板 */
export async function applyPreset(id: string, parts: readonly PresetPart[] = PRESET_PARTS) {
  const p = findPreset(id)
  if (!p) throw badRequest('行业模板不存在')
  const result = { examTypes: 0, gradeTemplates: 0, dicts: 0, subjects: 0 }

  if (parts.includes('exams') || parts.includes('grades') || parts.includes('profile')) {
    const next: EduConfig = structuredClone({ ...EDU })
    next.preset = p.id
    if (parts.includes('exams')) {
      const used = await examCodesInUse()
      const types = structuredClone(p.edu.examTypes)
      // 已有成绩在用、模板里没有的类型：保留为隐藏
      for (const c of used)
        if (!types.some((t) => t.code === c)) {
          const old = EDU.examTypes.find((t) => t.code === c) ?? exam({ code: c, name: c })
          types.push({ ...old, hidden: true })
        }
      next.examTypes = types
      result.examTypes = types.length
    }
    if (parts.includes('grades')) {
      next.gradeTemplates = structuredClone(p.edu.gradeTemplates)
      result.gradeTemplates = next.gradeTemplates.length
    }
    if (parts.includes('profile')) next.profileFields = structuredClone(p.edu.profileFields)
    await writeEdu(next)
  }

  if (parts.includes('dicts')) {
    const all = await readDictConfig()
    for (const [k, values] of Object.entries(p.dicts) as [EditableDictKey, string[]][]) {
      const current = [...(DICTS[k] as readonly string[])]
      const extra = current.filter((v) => !values.includes(v))
      all[k] = { values: [...values, ...extra], hidden: extra }
      result.dicts++
    }
    await applyDictConfig(all)
  }

  if (parts.includes('subjects')) result.subjects = await addPresetSubjects(prisma, p.subjects)
  return result
}
