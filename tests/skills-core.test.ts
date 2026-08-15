// 任务 5 技能解析核心测试：frontmatter / GitHub 链接解析 / 本地扫描 / 真实报错
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseSkillMarkdown, parseSourceInput, scanLocalDir, listSkillCandidates,
  rawGithubUrl, githubTreeSkillPaths
} from '../src/main/ai/skills-core'

describe('SKILL.md frontmatter 解析', () => {
  it('基础 name/description + 正文', () => {
    const md = '---\nname: 全店\ndescription: 全店经营评语技能\n---\n\n# 正文\n你是一名经营顾问\n'
    const p = parseSkillMarkdown(md)
    expect(p?.name).toBe('全店')
    expect(p?.description).toBe('全店经营评语技能')
    expect(p?.body).toContain('你是一名经营顾问')
  })

  it('带引号/冒号的值', () => {
    const md = '---\nname: "cs: 质检"\ndescription: \'包含: 冒号\'\n---\nbody\n'
    const p = parseSkillMarkdown(md)
    expect(p?.name).toBe('cs: 质检')
    expect(p?.description).toBe('包含: 冒号')
  })

  it('多行缩进 description', () => {
    const md = '---\nname: 单品\ndescription: 第一行\n  第二行\n  第三行\n---\nbody\n'
    const p = parseSkillMarkdown(md)
    expect(p?.description).toBe('第一行 第二行 第三行')
  })

  it('无 frontmatter 返回 null；BOM 前缀容忍', () => {
    expect(parseSkillMarkdown('# 没有 frontmatter')).toBeNull()
    const p = parseSkillMarkdown('\uFEFF---\nname: A\n---\nbody')
    expect(p?.name).toBe('A')
  })
})

describe('GitHub 链接解析', () => {
  it('仓库根 / tree / blob / .git 后缀 / ssh', () => {
    expect(parseSourceInput('https://github.com/anthropics/skills')).toMatchObject({ kind: 'github', owner: 'anthropics', repo: 'skills' })
    expect(parseSourceInput('https://github.com/anthropics/skills.git')).toMatchObject({ kind: 'github', owner: 'anthropics', repo: 'skills' })
    const tree = parseSourceInput('https://github.com/anthropics/skills/tree/main/skills/document-skills') as { kind: 'github'; ref: string; subPath: string }
    expect(tree.ref).toBe('main')
    expect(tree.subPath).toBe('skills/document-skills')
    const blob = parseSourceInput('https://github.com/owner/repo/blob/main/path/to/SKILL.md') as { kind: 'github'; ref: string; subPath: string }
    expect(blob.ref).toBe('main')
    expect(blob.subPath).toBe('path/to/SKILL.md')
    const ssh = parseSourceInput('git@github.com:openai/openai-agents-python.git')
    expect(ssh).toMatchObject({ kind: 'github', owner: 'openai', repo: 'openai-agents-python' })
  })

  it('无效输入真实报错', () => {
    expect(() => parseSourceInput('https://example.com/not-github')).toThrow(/无法识别的输入/)
    expect(() => parseSourceInput('C:\\不存在的\\目录')).toThrow(/本地目录不存在/)
  })

  it('raw URL 拼接与树查询参数', () => {
    expect(rawGithubUrl('o', 'r', 'main', 'skills/a/SKILL.md')).toBe('https://raw.githubusercontent.com/o/r/main/skills/a/SKILL.md')
    const res = githubTreeSkillPaths('o', 'r', 'main', 'skills')
    expect(res).rejects.toThrow() // 真实网络错误（假仓库）必须抛错而非假装成功
  })
})

describe('本地目录扫描', () => {
  it('递归找 SKILL.md，跳过 node_modules/.git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-scan-'))
    mkdirSync(join(dir, 'skills', 'a'), { recursive: true })
    mkdirSync(join(dir, 'skills', 'b'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'a', 'SKILL.md'), '---\nname: A\n---\n', 'utf8')
    writeFileSync(join(dir, 'skills', 'b', 'SKILL.md'), '---\nname: B\n---\n', 'utf8')
    writeFileSync(join(dir, 'skills', 'a', 'README.md'), 'no', 'utf8')
    writeFileSync(join(dir, 'node_modules', 'x', 'SKILL.md'), '---\nname: X\n---\n', 'utf8')
    const files = scanLocalDir(dir)
    expect(files.map((f) => f.relPath).sort()).toEqual(['skills/a/SKILL.md', 'skills/b/SKILL.md'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('无 SKILL.md 目录真实报错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-empty-'))
    await expect(listSkillCandidates(dir)).rejects.toThrow(/没有找到 SKILL.md/)
    rmSync(dir, { recursive: true, force: true })
  })
})
