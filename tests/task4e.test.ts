// 任务 4E 测试（TDD 先行）：agent → SKILL.md 转换、内置 13 技能结构、版本迁移（删旧/种子/强绑 7 板块）、幂等与用户绑定保护
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { deleteSkill, getSetting, listModuleBindings, listSkills, setModuleSkill, upsertShop, upsertSkill } from '../src/main/db/repo'
import { parseSkillMarkdown } from '../src/main/ai/skills-core'
import { buildSkillMd, EMOJI_RE, stripEmoji } from '../src/main/ai/builtin-convert'
import { BUILTIN_SKILLS, BUILTIN_MODULE_BINDINGS, BUILTIN_SKILLS_VERSION } from '../src/main/ai/builtin-skills'
import { ensureBuiltinSkills, skillsRoot } from '../src/main/ai/skills-service'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4e-'))
  const db = new AppDatabase(join(dir, '4e.db'))
  db.init()
  return db
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ecai-4e-root-'))
}

describe('任务 4E：emoji 剔除与 agent → SKILL.md 转换（纯函数）', () => {
  it('stripEmoji 剔除 emoji 与符号字符，保留中文/数字/标点', () => {
    expect(stripEmoji('🛍️ 你好 电商 🧠🎯→ 2026 ★ 数据')).toBe(' 你好 电商  2026  数据')
    expect(stripEmoji('纯中文，逗号。数字123；冒号：')).toBe('纯中文，逗号。数字123；冒号：')
  })

  it('EMOJI_RE 对纯文本 0 命中（验收扫描同一正则）', () => {
    expect('中文 电商 2026 运营 数据，。；：'.match(EMOJI_RE)).toBeNull()
  })

  it('buildSkillMd：frontmatter 只有 name/description，正文保留原文（仅剔除 emoji）', () => {
    const src = '---\nname: 中国电商运营专家\ndescription: 覆盖淘宝天猫的运营专家\nemoji: 🛍️\ncolor: red\n---\n\n# 中国电商运营专家\n\n你是一名运营专家，负责 🎯 大促 GMV。'
    const md = buildSkillMd('电商运营专家', '覆盖淘宝天猫的运营专家', src.replace(/^---\n[\s\S]*?\n---\n/, ''))
    const p = parseSkillMarkdown(md)
    expect(p?.name).toBe('电商运营专家')
    expect(p?.description).toBe('覆盖淘宝天猫的运营专家')
    expect(md).not.toContain('emoji:')
    expect(md).not.toContain('color:')
    expect(md.match(EMOJI_RE)).toBeNull()
    expect(p?.body).toContain('# 中国电商运营专家')
    expect(p?.body).toContain('大促 GMV')
    expect(p?.body).not.toContain('🎯')
  })
})

describe('任务 4E：BUILTIN_SKILLS = 12 精选 + 1 兜底（全中文名、真实来源、0 emoji）', () => {
  const EXPECTED_NAMES = [
    '电商运营专家', '商品定价策略师', '付费推广优化师', '客服服务专家', '运营效能顾问',
    '搜索词分析师', '电商经营战略顾问', '电商运营策略师', '经营摘要专家', '电商数据分析师',
    '选品趋势研究员', '客服话术教练', '通用分析顾问'
  ]

  it('13 条且名字与选型表一致（全中文名）', () => {
    expect(BUILTIN_SKILLS.map((s) => s.name)).toEqual(EXPECTED_NAMES)
  })

  it('每条 content 是合法 SKILL.md（gray-matter 可解析，frontmatter name=中文名）', () => {
    for (const s of BUILTIN_SKILLS) {
      const p = parseSkillMarkdown(s.content)
      expect(p, s.name + ' frontmatter 应可解析').not.toBeNull()
      expect(p?.name).toBe(s.name)
      expect(p?.description ?? '').not.toBe('')
      expect(p?.body.length).toBeGreaterThan(50)
    }
  })

  it('frontmatter 无 emoji/color 字段，全内容 emoji 扫描 0 命中', () => {
    for (const s of BUILTIN_SKILLS) {
      const fm = s.content.split('---')[1] ?? ''
      expect(fm).not.toMatch(/emoji\s*:/)
      expect(fm).not.toMatch(/color\s*:/)
      expect(s.content.match(EMOJI_RE), s.name + ' 不应含 emoji').toBeNull()
      expect(stripEmoji(s.content)).toBe(s.content)
    }
  })

  it('12 个精选技能带真实源 URL 与字符数（防作弊），兜底技能豁免', () => {
    for (const s of BUILTIN_SKILLS) {
      if (s.name === '通用分析顾问') continue
      expect(s.sourceUrl, s.name).toMatch(/jnMetaCode\/agency-agents-zh/)
      expect(s.sourceChars, s.name).toBeGreaterThan(2000)
      expect(s.content.length).toBeGreaterThan(s.sourceChars * 0.8)
    }
  })

  it('BUILTIN_MODULE_BINDINGS 精确覆盖 7 板块且指向对应中文名', () => {
    expect(BUILTIN_MODULE_BINDINGS).toEqual([
      { module: '全店', skillName: '电商运营专家' },
      { module: '单品', skillName: '商品定价策略师' },
      { module: '推广', skillName: '付费推广优化师' },
      { module: '客服', skillName: '客服服务专家' },
      { module: 'DSR', skillName: '运营效能顾问' },
      { module: '搜索词', skillName: '搜索词分析师' },
      { module: '指南', skillName: '电商经营战略顾问' }
    ])
    const names = new Set(BUILTIN_SKILLS.map((s) => s.name))
    for (const b of BUILTIN_MODULE_BINDINGS) expect(names.has(b.skillName)).toBe(true)
  })
})

describe('任务 4E：ensureBuiltinSkills 版本迁移（删旧→种子→强绑 7 板块）', () => {
  it('新库首启：skills 13 条、module_skills 7 绑定、版本号写入、目录 13 个', () => {
    const db = freshDb()
    const root = tempRoot()
    ensureBuiltinSkills(db, root)
    const skills = listSkills(db)
    expect(skills).toHaveLength(13)
    expect(skills.every((s) => /^[\u4e00-\u9fa5]+$/.test(String(s.name)))).toBe(true)
    const binds = listModuleBindings(db)
    expect(binds).toHaveLength(7)
    const map = Object.fromEntries(binds.map((b) => [b.module, b.skillName]))
    expect(map).toEqual({
      全店: '电商运营专家', 单品: '商品定价策略师', 推广: '付费推广优化师', 客服: '客服服务专家',
      DSR: '运营效能顾问', 搜索词: '搜索词分析师', 指南: '电商经营战略顾问'
    })
    expect(getSetting(db, 'builtin_skills_version')).toBe(BUILTIN_SKILLS_VERSION)
    const dirs = readdirSync(skillsRoot(root)).filter((d) => !d.startsWith('.'))
    expect(dirs.sort()).toEqual([...new Set(BUILTIN_SKILLS.map((s) => s.name))].sort())
    expect(dirs).toHaveLength(13)
    db.close(); rmSync(root, { recursive: true, force: true })
  })

  it('旧 v1 库迁移：删旧 3 行+旧绑定+遗留目录，种子 13 新，强绑 7 板块', () => {
    const db = freshDb()
    const root = tempRoot()
    // 模拟任务 5 旧库：3 个占位技能 + 绑定 + 遗留 anthropics 目录/行
    const old = ['全店', '单品', '指南']
    for (const n of old) {
      const id = upsertSkill(db, { name: n, description: '旧占位', path: 'skills/' + n + '/SKILL.md' })
      setModuleSkill(db, n, id)
      mkdirSync(join(skillsRoot(root), n), { recursive: true })
      writeFileSync(join(skillsRoot(root), n, 'SKILL.md'), '---\nname: ' + n + '\n---\nold', 'utf8')
    }
    const legacyId = upsertSkill(db, { name: 'algorithmic-art', description: '遗留', path: 'skills/algorithmic-art/SKILL.md' })
    mkdirSync(join(skillsRoot(root), 'algorithmic-art'), { recursive: true })
    writeFileSync(join(skillsRoot(root), 'algorithmic-art', 'SKILL.md'), '---\nname: algorithmic-art\n---\nlegacy', 'utf8')
    expect(listSkills(db)).toHaveLength(4)
    expect(listModuleBindings(db)).toHaveLength(3)

    ensureBuiltinSkills(db, root)

    expect(listSkills(db)).toHaveLength(13)
    expect(listSkills(db).some((s) => s.name === 'algorithmic-art')).toBe(false)
    expect(existsSync(join(skillsRoot(root), 'algorithmic-art'))).toBe(false)
    expect(existsSync(join(skillsRoot(root), '全店'))).toBe(false)
    expect(listModuleBindings(db)).toHaveLength(7)
    const map = Object.fromEntries(listModuleBindings(db).map((b) => [b.module, b.skillName]))
    expect(map['全店']).toBe('电商运营专家')
    expect(map['指南']).toBe('电商经营战略顾问')
    expect(getSetting(db, 'builtin_skills_version')).toBe(BUILTIN_SKILLS_VERSION)
    db.close(); rmSync(root, { recursive: true, force: true })
  })

  it('旧库 ai_analyses/messages 引用旧技能时迁移不炸：先置空引用再删旧行', () => {
    const db = freshDb()
    const root = tempRoot()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    const oldId = upsertSkill(db, { name: '全店', description: '旧占位', path: 'skills/全店/SKILL.md' })
    db.raw.prepare('INSERT INTO ai_analyses (shop_id, module, date, content, source_skill_id, model) VALUES (?, \'摘要\', \'2026-08-14\', \'旧评语 412208.36 元\', ?, \'deepseek-chat\')').run(shopId, oldId)
    const convInfo = db.raw.prepare('INSERT INTO conversations (title) VALUES (\'t\')').run()
    const convId = Number(convInfo.lastInsertRowid)
    db.raw.prepare('INSERT INTO messages (conversation_id, role, content, skill_id) VALUES (?, \'user\', \'hi\', ?)').run(convId, oldId)
    ensureBuiltinSkills(db, root)
    expect(listSkills(db)).toHaveLength(13)
    const an = db.raw.prepare('SELECT source_skill_id AS sourceSkillId, content FROM ai_analyses WHERE module = \'摘要\'').get() as { content: string; sourceSkillId: number | null }
    expect(an).toBeTruthy()
    expect(an.content).toContain('412208.36')
    expect(an.sourceSkillId).toBeNull()
    const msg = db.raw.prepare('SELECT skill_id AS skillId FROM messages WHERE conversation_id = ?').get(convId) as { skillId: number | null }
    expect(msg.skillId).toBeNull()
    db.close(); rmSync(root, { recursive: true, force: true })
  })

  it('幂等：重复调用不翻倍、不重建目录文件', () => {
    const db = freshDb()
    const root = tempRoot()
    ensureBuiltinSkills(db, root)
    const mtime = join(skillsRoot(root), '电商运营专家', 'SKILL.md')
    ensureBuiltinSkills(db, root)
    expect(listSkills(db)).toHaveLength(13)
    expect(listModuleBindings(db)).toHaveLength(7)
    expect(getSetting(db, 'builtin_skills_version')).toBe(BUILTIN_SKILLS_VERSION)
    db.close(); rmSync(root, { recursive: true, force: true })
  })

  it('版本已最新时用户自定义绑定不被覆盖（只在迁移时强绑）', () => {
    const db = freshDb()
    const root = tempRoot()
    ensureBuiltinSkills(db, root)
    // 用户把「全店」改绑到「客服话术教练」
    const coach = listSkills(db).find((s) => s.name === '客服话术教练') as { id: number }
    setModuleSkill(db, '全店', coach.id)
    ensureBuiltinSkills(db, root)
    const map = Object.fromEntries(listModuleBindings(db).map((b) => [b.module, b.skillName]))
    expect(map['全店']).toBe('客服话术教练')
    expect(map['单品']).toBe('商品定价策略师')
    db.close(); rmSync(root, { recursive: true, force: true })
  })
})
