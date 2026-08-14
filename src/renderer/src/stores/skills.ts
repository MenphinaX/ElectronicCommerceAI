import { defineStore } from 'pinia'

export interface SkillItem {
  id: number
  name: string
  description: string | null
  path: string
  enabled: number
  installedAt: string
}

// 技能管理 store：解析/安装/编辑/删除/模块绑定（解析走主进程真实读取仓库）
export const useSkillsStore = defineStore('skills', {
  state: () => ({
    skills: [] as SkillItem[],
    bindings: [] as Array<Record<string, unknown>>,
    modules: [] as string[],
    loaded: false
  }),
  actions: {
    async load(): Promise<void> {
      const r = await window.api.skills.list()
      this.skills = r.skills as unknown as SkillItem[]
      this.bindings = r.bindings
      this.modules = r.modules
      this.loaded = true
    },
    parse(input: string): Promise<Array<Record<string, unknown>>> {
      return window.api.skills.parse(input)
    },
    async install(candidates: Array<{ name: string; description?: string; content: string }>): Promise<Array<Record<string, unknown>>> {
      const r = await window.api.skills.install(candidates)
      await this.load()
      return r
    },
    read(id: number): Promise<{ name: string; description: string; content: string }> {
      return window.api.skills.read(id)
    },
    async save(id: number, content: string): Promise<Record<string, unknown>> {
      const r = await window.api.skills.save(id, content)
      await this.load()
      return r
    },
    async remove(id: number): Promise<boolean> {
      const ok = await window.api.skills.remove(id)
      await this.load()
      return ok
    },
    async setBinding(module: string, skillId: number | null): Promise<boolean> {
      const ok = await window.api.skills.setBinding(module, skillId)
      await this.load()
      return ok
    }
  }
})
