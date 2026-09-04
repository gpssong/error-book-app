/**
 * 年级标准数据
 *
 * 三段式学段：
 *  - 小学: 1~6 年级
 *  - 初中: 初一 ~ 初三
 *  - 高中: 高一 ~ 高三
 *
 * 暴露给前端下拉选择；同时 grade → 学段映射用于 AI 出题时附加学段描述。
 */
export interface GradeOption {
  /** 存到数据库的 grade 字符串 */
  value: string
  /** UI 标签 */
  label: string
  /** 学段简称: 小学 / 初中 / 高中 */
  stage: '小学' | '初中' | '高中'
  /** 学段年级序号 1-12 (用于 AI 难度描述) */
  level: number
}

export const GRADE_OPTIONS: GradeOption[] = [
  // 小学
  { value: '小学一年级', label: '小学一年级', stage: '小学', level: 1 },
  { value: '小学二年级', label: '小学二年级', stage: '小学', level: 2 },
  { value: '小学三年级', label: '小学三年级', stage: '小学', level: 3 },
  { value: '小学四年级', label: '小学四年级', stage: '小学', level: 4 },
  { value: '小学五年级', label: '小学五年级', stage: '小学', level: 5 },
  { value: '小学六年级', label: '小学六年级', stage: '小学', level: 6 },
  // 初中
  { value: '初一', label: '初一', stage: '初中', level: 7 },
  { value: '初二', label: '初二', stage: '初中', level: 8 },
  { value: '初三', label: '初三', stage: '初中', level: 9 },
  // 高中
  { value: '高一', label: '高一', stage: '高中', level: 10 },
  { value: '高二', label: '高二', stage: '高中', level: 11 },
  { value: '高三', label: '高三', stage: '高中', level: 12 },
]

/** 学段分组（用于下拉 UI） */
export const GRADE_STAGES = [
  {
    name: '小学',
    grades: GRADE_OPTIONS.filter((g) => g.stage === '小学'),
  },
  {
    name: '初中',
    grades: GRADE_OPTIONS.filter((g) => g.stage === '初中'),
  },
  {
    name: '高中',
    grades: GRADE_OPTIONS.filter((g) => g.stage === '高中'),
  },
]

/**
 * 从 grade 字符串还原出学段描述，用于给 AI prompt 提示。
 * 例: "小学三年级" → "小学三年级 (6-9 岁) / 难度: 基础"
 *     "初三"       → "初中三年级 / 难度: 中等偏上"
 *     "高一"       → "高中一年级 / 难度: 较难"
 */
export function describeGrade(grade?: string): {
  stage: string
  fullLabel: string
  difficulty: string
  knowledgeScope: string
} {
  if (!grade) {
    return {
      stage: '未指定',
      fullLabel: '未指定',
      difficulty: '中等',
      knowledgeScope: '通用',
    }
  }

  const found = GRADE_OPTIONS.find((g) => g.value === grade)
  if (!found) {
    return {
      stage: grade,
      fullLabel: grade,
      difficulty: '中等',
      knowledgeScope: '通用',
    }
  }

  // 难度与知识点范围按学段给 AI
  let difficulty = '中等'
  let knowledgeScope = ''
  switch (found.stage) {
    case '小学':
      difficulty = '基础'
      knowledgeScope = found.level <= 2
        ? '基础加减法、简单应用题、看图列式'
        : found.level <= 4
        ? '整数四则运算、简单几何、统计初步'
        : '分数小数、简单方程、几何面积体积'
      break
    case '初中':
      difficulty = found.level <= 8 ? '中等' : '中等偏上'
      knowledgeScope = found.level <= 8
        ? '整式分式、一元二次方程、函数基础、平面几何'
        : '二次函数综合、相似三角形、圆、一元二次方程根'
      break
    case '高中':
      difficulty = found.level <= 10 ? '较难' : '困难'
      knowledgeScope = found.level <= 10
        ? '集合函数、导数基础、三角函数、数列基础'
        : '导数综合、解析几何、立体几何、概率统计'
      break
  }

  return {
    stage: found.stage,
    fullLabel: `${found.stage}${found.value.replace(found.stage, '')}`,
    difficulty,
    knowledgeScope,
  }
}

/** AI prompt 中需要注入的学段描述块 */
export function buildGradePrompt(grade?: string): string {
  const info = describeGrade(grade)
  if (info.fullLabel === '未指定') {
    return '【学段信息】未指定年级，按中等难度、通用知识点出题。'
  }
  return [
    `【学段信息】${info.fullLabel} (${info.stage})`,
    `【难度要求】${info.difficulty}`,
    `【知识点范围】${info.knowledgeScope}`,
    `【特别强调】请确保题目的概念、计算复杂度、所用公式严格匹配该学段${info.stage}学生的认知水平；不要出现超纲内容（如给小学生出方程组、给初中生出微积分）。`,
  ].join('\n')
}
