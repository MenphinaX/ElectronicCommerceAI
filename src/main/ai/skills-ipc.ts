// 任务 5 技能管理 IPC：解析/安装/编辑/删除/模块绑定（渲染层一律走这里，不直接碰文件/库）
import { ipcMain } from 'electron'
import type { AppDatabase } from '../db/database'
import { listModuleBindings, listSkills, setModuleSkill } from '../db/repo'
import { listSkillCandidates } from './skills-core'

let parseAbort: AbortController | null = null
import { deleteSkillDir, installSkills, readSkillContent, saveSkillContent, SKILL_MODULES } from './skills-service'

export function registerSkillsIpc(getDb: () => AppDatabase, rootDir: () => string): void {
  ipcMain.handle('skills:list', () => ({
    skills: listSkills(getDb()),
    bindings: listModuleBindings(getDb()),
    modules: SKILL_MODULES
  }))

  // 解析：真实读取 GitHub/本地仓库里的 SKILL.md；失败抛明确错误（异步 + 可取消，主进程不阻塞）
  ipcMain.handle('skills:parse', (_e, input: string) => {
    parseAbort?.abort()
    const ctrl = new AbortController()
    parseAbort = ctrl
    return listSkillCandidates(String(input ?? ''), { gitFallback: true, signal: ctrl.signal }).finally(() => {
      if (parseAbort === ctrl) parseAbort = null
    })
  })

  // 取消当前解析：git clone / GitHub API 全部随 signal 中止，渲染层立刻恢复可操作
  ipcMain.handle('skills:parse-cancel', () => {
    parseAbort?.abort()
    return true
  })

  ipcMain.handle('skills:install', (_e, candidates: Array<{ name: string; description?: string; content: string }>) => {
    if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('没有可安装的技能')
    return installSkills(getDb(), rootDir(), candidates)
  })

  ipcMain.handle('skills:read', (_e, id: number) => readSkillContent(getDb(), rootDir(), Number(id)))

  ipcMain.handle('skills:save', (_e, id: number, content: string) => saveSkillContent(getDb(), rootDir(), Number(id), String(content)))

  ipcMain.handle('skills:delete', (_e, id: number) => deleteSkillDir(getDb(), rootDir(), Number(id)))

  ipcMain.handle('skills:set-binding', (_e, module: string, skillId: number | null) => {
    if (!SKILL_MODULES.includes(String(module))) throw new Error(`未知模块：${String(module)}`)
    setModuleSkill(getDb(), String(module), skillId === null ? null : Number(skillId))
    return true
  })
}
