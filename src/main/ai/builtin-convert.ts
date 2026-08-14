// 任务 4E：agent .md → SKILL.md 转换纯函数（可单测）
// 坑记录 4E：仓库 agent 是 Claude Code 风格（frontmatter 带 emoji/color），不是 SKILL.md；
// 软件全应用禁 emoji → 转换后全技能内容 emoji 扫描 0 命中；正文只做机械剔除，不改写措辞
export const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{23E9}-\u{23FA}\u{25AA}-\u{25FE}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}\u{231A}\u{231B}\u{FE0F}\u{200D}]/gu

/** 剔除 emoji/符号字符（含箭头、星号、ZWJ、变体选择符），保留中文/数字/常规标点 */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '')
}

/** agent .md 正文 → SKILL.md：frontmatter 只用 name/description（无 emoji/color），正文保留原文（剔除 emoji 字符） */
export function buildSkillMd(name: string, description: string, body: string): string {
  const clean = stripEmoji(body).replace(/^\n+/, '')
  return `---\nname: ${name}\ndescription: ${description.trim()}\n---\n\n${clean}`
}
