// 任务 5/4E 技能服务：技能目录读写/安装/编辑/删除/内置种子（只写本地 skills 目录，经营数据绝不上传）
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { AppDatabase } from '../db/database'
import {
  deleteSkill, getSetting, getSkill, listModuleBindings, listSkills, setModuleSkill, setSetting, upsertSkill
} from '../db/repo'
import { parseSkillMarkdown } from './skills-core'
import { BUILTIN_SKILLS, BUILTIN_MODULE_BINDINGS, BUILTIN_SKILLS_VERSION } from './builtin-skills'

/** 看板可绑定技能的模块清单（任务 6 评语按模块取绑定技能） */
export const SKILL_MODULES = ['全店', '单品', '推广', '客服', 'DSR', '搜索词', '指南']

/** settings 表内置技能版本键：任务 5=v1（3 占位），任务 4E=v2（13 精选） */
const BUILTIN_VERSION_KEY = 'builtin_skills_version'

export function skillsRoot(rootDir: string): string {
  return join(rootDir, 'skills')
}

/** 技能名 → 安全目录名（防路径穿越） */
export function sanitizeSkillName(name: string): string {
  const s = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80)
  if (!s) throw new Error('技能名不能为空或含非法字符')
  return s
}

function safePath(root: string, ...segs: string[]): string {
  const full = resolve(root, ...segs)
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error('技能路径越界，已拒绝')
  }
  return full
}

function skillFile(rootDir: string, name: string): string {
  return safePath(skillsRoot(rootDir), sanitizeSkillName(name), 'SKILL.md')
}

function dirOf(rootDir: string, name: string): string {
  return safePath(skillsRoot(rootDir), sanitizeSkillName(name))
}

/** 写内置 SKILL.md 文件 + upsert DB 行（迁移时 overwrite=true 强制覆盖；平时已存在不覆盖以保护用户编辑） */
function seedBuiltinFiles(db: AppDatabase, rootDir: string, overwrite: boolean): void {
  const root = skillsRoot(rootDir)
  mkdirSync(root, { recursive: true })
  for (const b of BUILTIN_SKILLS) {
    const file = skillFile(rootDir, b.name)
    const dir = dirOf(rootDir, b.name)
    if (overwrite || !existsSync(file)) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(file, b.content, 'utf8')
    }
    upsertSkill(db, {
      name: b.name,
      description: b.description,
      path: relative(rootDir, file).split(sep).join('/')
    })
  }
}

/** 内置技能种子 + 版本迁移（任务 4E，坑记录 4E：直接替换 BUILTIN_SKILLS 旧技能不消失、绑定不更新）：
 * v1(3 占位) → v2(13 精选)：删旧 DB 行（级联清旧绑定）+ 删旧目录 → 种子 13 新 → 强制 setModuleSkill 覆盖 7 板块
 * 版本已最新：仅补种缺失文件/行，不覆盖用户编辑、不重绑 */
export function ensureBuiltinSkills(db: AppDatabase, rootDir: string): void {
  const root = skillsRoot(rootDir)
  mkdirSync(root, { recursive: true })
  const migrating = getSetting(db, BUILTIN_VERSION_KEY) !== BUILTIN_SKILLS_VERSION
  if (migrating) {
    // 1) 删 skills 目录里所有非新内置目录（旧 全店/单品/指南 占位 + anthropics 遗留等）
    const names = new Set(BUILTIN_SKILLS.map((b) => b.name))
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && !names.has(entry.name)) {
        rmSync(safePath(root, entry.name), { recursive: true, force: true })
      }
    }
    // 2) 删旧 DB 行（module_skills 外键级联清旧绑定）；
    //    坑：ai_analyses.source_skill_id / messages.skill_id 无级联，先置空引用再删，否则 FOREIGN KEY constraint failed
    const staleIds = (listSkills(db) as Array<{ id: number; name: string }>).filter((r) => !names.has(r.name)).map((r) => Number(r.id))
    for (const id of staleIds) {
      db.raw.prepare('UPDATE ai_analyses SET source_skill_id = NULL WHERE source_skill_id = ?').run(id)
      db.raw.prepare('UPDATE messages SET skill_id = NULL WHERE skill_id = ?').run(id)
      deleteSkill(db, id)
    }
    // 3) 种子 13 个新 SKILL.md + upsert DB 行
    seedBuiltinFiles(db, rootDir, true)
    // 4) 强制 setModuleSkill 绑定 7 板块（覆盖旧绑定，不只预绑定）
    for (const b of BUILTIN_MODULE_BINDINGS) {
      const row = (listSkills(db) as Array<{ id: number; name: string }>).find((s) => s.name === b.skillName)
      if (row) setModuleSkill(db, b.module, row.id)
    }
    setSetting(db, BUILTIN_VERSION_KEY, BUILTIN_SKILLS_VERSION)
  } else {
    seedBuiltinFiles(db, rootDir, false)
  }
}

/** 安装候选技能：写文件 + 落库（name 冲突按 upsert 覆盖更新） */
export function installSkills(
  db: AppDatabase,
  rootDir: string,
  candidates: Array<{ name: string; description?: string; content: string }>
): Array<Record<string, unknown>> {
  const root = skillsRoot(rootDir)
  mkdirSync(root, { recursive: true })
  const out: Array<Record<string, unknown>> = []
  for (const c of candidates) {
    const name = sanitizeSkillName(c.name)
    const file = skillFile(rootDir, name)
    const dir = dirOf(rootDir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, c.content, 'utf8')
    const id = upsertSkill(db, {
      name,
      description: c.description ?? '',
      path: relative(rootDir, file).split(sep).join('/')
    })
    out.push({ id, name, path: relative(rootDir, file).split(sep).join('/') })
  }
  return out
}

export function readSkillContent(db: AppDatabase, rootDir: string, skillId: number): { name: string; description: string; content: string } {
  const row = getSkill(db, skillId)
  if (!row) throw new Error('技能不存在')
  const rel = String(row.path)
  const full = safePath(rootDir, rel)
  if (!existsSync(full)) throw new Error(`技能文件缺失：${rel}`)
  return {
    name: String(row.name),
    description: String(row.description ?? ''),
    content: readFileSync(full, 'utf8')
  }
}

/** 保存编辑后的 SKILL.md：改名=写新目录删旧目录；改描述=同步 DB；正文立即生效 */
export function saveSkillContent(db: AppDatabase, rootDir: string, skillId: number, content: string): Record<string, unknown> {
  const row = getSkill(db, skillId)
  if (!row) throw new Error('技能不存在')
  const parsed = parseSkillMarkdown(content)
  if (!parsed?.name) throw new Error('SKILL.md 必须有 YAML frontmatter（name + 正文），保存被拒绝')
  const oldName = String(row.name)
  const newName = sanitizeSkillName(parsed.name)
  const oldFile = safePath(rootDir, String(row.path))
  const newFile = skillFile(rootDir, newName)
  if (oldFile !== newFile) {
    mkdirSync(join(newFile, '..'), { recursive: true })
    writeFileSync(newFile, content, 'utf8')
    if (existsSync(oldFile)) rmSync(oldFile)
    // 旧目录若已空则删除
    const oldDir = dirOf(rootDir, oldName)
    try {
      if (oldDir !== dirOf(rootDir, newName) && existsSync(oldDir)) rmSync(oldDir, { recursive: true, force: true })
    } catch {
      // 清理失败不阻塞
    }
  } else {
    writeFileSync(newFile, content, 'utf8')
  }
  upsertSkill(db, {
    name: newName,
    description: parsed.description || String(row.description ?? ''),
    path: relative(rootDir, newFile).split(sep).join('/')
  })
  const updated = getSkill(db, skillId)
  return { id: skillId, name: newName, description: parsed.description || String(row.description ?? ''), path: updated?.path }
}

/** 删除技能：删目录 + 删 DB 行（module_skills 级联清绑定） */
export function deleteSkillDir(db: AppDatabase, rootDir: string, skillId: number): boolean {
  const row = getSkill(db, skillId)
  if (!row) return false
  const full = safePath(rootDir, String(row.path))
  if (existsSync(full)) rmSync(full)
  const dir = dirOf(rootDir, String(row.name))
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch {
    // 目录清理失败不阻塞
  }
  return deleteSkill(db, skillId)
}
