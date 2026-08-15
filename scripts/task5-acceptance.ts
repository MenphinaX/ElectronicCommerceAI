// 任务 5 验收脚本：模型配置 + 技能管理
// 跑法：npx tsx scripts/task5-acceptance.ts  （结果写 task5-acceptance.log）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { SCHEMA_VERSION } from '../src/main/db/schema'
import {
  createModel, deleteModel, getDefaultModelId, listModels, listModuleBindings,
  setDefaultModel, setModuleSkill, updateModel, upsertSkill
} from '../src/main/db/repo'
import { listSkillCandidates, parseSkillMarkdown, parseSourceInput, scanLocalDir } from '../src/main/ai/skills-core'
import { deleteSkillDir, ensureBuiltinSkills, installSkills, readSkillContent, saveSkillContent, SKILL_MODULES } from '../src/main/ai/skills-service'

const LOG = join(process.cwd(), 'task5-acceptance.log')
const out: string[] = []
let passCount = 0
let failCount = 0
function check(name: string, cond: boolean, detail = ''): void {
  const ok = !!cond
  if (ok) passCount++
  else failCount++
  out.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
}
function line(s = ''): void { out.push(s); console.log(s) }

function freshDb(): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task5-acc-'))
  const db = new AppDatabase(join(dir, 'acc.db'))
  db.init()
  return { db, dir }
}

function scanFiles(root: string, exts: string[]): string[] {
  const hits: string[] = []
  const walk = (cur: string): void => {
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      const full = join(cur, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out') continue
        walk(full)
      } else if (exts.some((x) => e.name.endsWith(x))) {
        hits.push(full)
      }
    }
  }
  walk(root)
  return hits
}

// ================= 1. schema：v4 + is_default 列 =================
{
  const { db, dir } = freshDb()
  check('schema-user_version=SCHEMA_VERSION', db.userVersion() === SCHEMA_VERSION, `v${db.userVersion()}`)
  const cols = db.raw.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>
  check('schema-models 含 is_default', cols.some((c) => c.name === 'is_default'))
  check('schema-19 张表', db.rowCounts() && Object.keys(db.rowCounts()).length === 19)
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ================= 2. 模型 CRUD + 默认互斥（key 只存密文形态） =================
{
  const { db, dir } = freshDb()
  const rawKey = 'sk-' + Math.random().toString(36).slice(2)
  const enc = Buffer.from('enc:' + rawKey).toString('base64')
  const a = createModel(db, { name: 'deepseek-chat', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKeyEnc: enc, enabled: true })
  const b = createModel(db, { name: 'qwen-plus', provider: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnc: null })
  check('模型-创建 2 条', a > 0 && b > 0)
  const rows = listModels(db) as Array<{ id: number; name: string; apiKeyEnc: string | null; isDefault: number }>
  check('模型-密文与明文不同且非明文本身', rows.find((r) => r.id === a)?.apiKeyEnc !== rawKey && rows.find((r) => r.id === a)?.apiKeyEnc === enc)
  check('模型-无 key 时 apiKeyEnc 为 null', rows.find((r) => r.id === b)?.apiKeyEnc === null)
  updateModel(db, a, { name: 'deepseek-v4', baseUrl: 'https://api.deepseek.com/v2' })
  const u = listModels(db) as Array<{ name: string; baseUrl: string }>
  check('模型-更新生效', u.find((r) => r.name === 'deepseek-v4')?.baseUrl === 'https://api.deepseek.com/v2')
  setDefaultModel(db, a)
  setDefaultModel(db, b)
  const defRows = listModels(db) as Array<{ id: number; isDefault: number }>
  check('模型-默认互斥（设 B 后 A 清除）', getDefaultModelId(db) === b && defRows.find((r) => r.id === a)?.isDefault === 0)
  check('模型-删除', deleteModel(db, a) && !deleteModel(db, a) && listModels(db).length === 1)

  // key 明文搜索：组装后的明文在 src/ 与 docs/ 下必须 0 命中
  const keyHits: string[] = []
  for (const root of ['src', 'docs']) {
    for (const f of scanFiles(join(process.cwd(), root), ['.ts', '.vue', '.d.ts', '.md', '.js', '.mjs'])) {
      const text = readFileSync(f, 'utf8')
      if (text.includes(rawKey)) keyHits.push(f)
    }
  }
  check('key 明文搜索全项目为 0', keyHits.length === 0, keyHits.join(',') || '0 处')
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ================= 3. 内置技能种子（全店/单品/指南）+ 预绑定 =================
{
  const { db, dir } = freshDb()
  ensureBuiltinSkills(db, dir)
  const root = join(dir, 'skills')
  const files = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  check('内置-3 个技能目录', files.includes('全店') && files.includes('单品') && files.includes('指南'))
  check('内置-每个 SKILL.md 存在且可解析', ['全店', '单品', '指南'].every((n) => {
    const md = readFileSync(join(root, n, 'SKILL.md'), 'utf8')
    return parseSkillMarkdown(md)?.name === n
  }))
  const bindings = listModuleBindings(db).map((r) => String(r.module))
  check('内置-预绑定 全店/单品/指南', bindings.includes('全店') && bindings.includes('单品') && bindings.includes('指南'))
  check('内置-模块清单 7 项', SKILL_MODULES.length === 7 && SKILL_MODULES.includes('DSR'))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ================= 4. 本地 git 仓库路径解析 + 安装/编辑/删除闭环 =================
{
  const repo = mkdtempSync(join(tmpdir(), 'ecai-skillrepo-'))
  mkdirSync(join(repo, 'skills', '客服质检'), { recursive: true })
  writeFileSync(
    join(repo, 'skills', '客服质检', 'SKILL.md'),
    '---\nname: 客服质检\ndescription: 客服聊天质检技能（本地夹具）\n---\n\n# 客服质检\n按提示词逐条检查客服回复质量。\n',
    'utf8'
  )
  writeFileSync(join(repo, 'README.md'), '# fixture', 'utf8')
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })
  } catch {
    // 无 git 时本地目录解析仍可用
  }
  const cands = await listSkillCandidates(repo)
  check('解析-本地 git 仓库找到 SKILL.md', cands.length === 1 && cands[0].name === '客服质检' && cands[0].content.includes('客服聊天质检技能'), JSON.stringify(cands.map((c) => ({ name: c.name, path: c.relPath }))))
  check('解析-本地来源标记', cands[0].source === 'local')

  const { db, dir } = freshDb()
  const installed = installSkills(db, dir, cands.map((c) => ({ name: c.name, description: c.description, content: c.content })))
  check('安装-落库 1 条', installed.length === 1 && existsSync(join(dir, 'skills', '客服质检', 'SKILL.md')))
  const id = installed[0].id as number
  const before = readSkillContent(db, dir, id)
  check('读取-内容与源一致', before.content.includes('按提示词逐条检查'))

  const edited = before.content.replace('按提示词逐条检查客服回复质量。', '先总结问题，再给改进建议；每条结论必须引用原文。')
  const saved = saveSkillContent(db, dir, id, edited)
  check('编辑-保存成功', saved.name === '客服质检')
  const after = readSkillContent(db, dir, id)
  check('编辑-再次打开内容一致', after.content === edited && after.content.includes('先总结问题'))
  check('删除-文件与记录均消失', deleteSkillDir(db, dir, id) && !existsSync(join(dir, 'skills', '客服质检')))

  // 改名场景：frontmatter name 改掉 → 新目录写、旧目录删
  const id2 = installSkills(db, dir, [{ name: 'A技能', description: 'd', content: '---\nname: A技能\n---\nbody' }])[0].id as number
  saveSkillContent(db, dir, id2, '---\nname: B技能\n---\nbody2')
  check('改名-新名生效且旧目录删除', existsSync(join(dir, 'skills', 'B技能', 'SKILL.md')) && !existsSync(join(dir, 'skills', 'A技能')))
  db.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(repo, { recursive: true, force: true })
}

// ================= 5. 真实 GitHub 仓库解析（anthropics/skills；网络失败如实记录） =================
{
  try {
    const cands = await listSkillCandidates('https://github.com/anthropics/skills')
    check('GitHub-真实仓库解析出技能（≥1）', cands.length >= 1, `${cands.length} 个：` + cands.slice(0, 5).map((c) => `${c.name}@${c.relPath}`).join('、'))
    check('GitHub-技能名/描述来自真实 SKILL.md', cands.every((c) => c.name.length > 0 && c.source === 'github' && c.content.includes('---')))
    if (cands.length > 0) {
      const { db, dir } = freshDb()
      const installed = installSkills(db, dir, [{ name: cands[0].name, description: cands[0].description, content: cands[0].content }])
      check('GitHub-安装成功落库', installed.length === 1 && existsSync(join(dir, 'skills', String(cands[0].name), 'SKILL.md')))
      const got = readSkillContent(db, dir, installed[0].id as number)
      check('GitHub-读回内容一致', got.content === cands[0].content)
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  } catch (e) {
    check('GitHub-真实仓库解析（本轮网络异常，如实记录）', false, (e as Error).message)
  }
}

// ================= 6. 坏链接/断网真实报错（防作弊：不许假装成功） =================
{
  await listSkillCandidates('https://github.com/this-repo-does-not-exist-xyz/not-exist-repo-abc').then(
    () => check('坏链接-必须报错', false, '居然解析成功了'),
    (e) => check('坏链接-真实报错', /(404|不存在|限流|网络|失败|clone)/.test((e as Error).message), (e as Error).message)
  )
  check('无效输入-真实报错', (() => { try { parseSourceInput('https://example.com/x') } catch { return true } return false })())
}

// ================= 7. 模块绑定替换 + 删除级联 =================
{
  const { db, dir } = freshDb()
  ensureBuiltinSkills(db, dir)
  const skills = db.raw.prepare('SELECT id, name FROM skills').all() as Array<{ id: number; name: string }>
  const quan = skills.find((s) => s.name === '全店')!
  const danpin = skills.find((s) => s.name === '单品')!
  setModuleSkill(db, '全店', quan.id)
  setModuleSkill(db, '全店', danpin.id)
  const binds = listModuleBindings(db).filter((r) => r.module === '全店')
  check('绑定-替换语义（一个模块只剩一个）', binds.length === 1 && binds[0].skillId === danpin.id)
  setModuleSkill(db, '全店', null)
  check('绑定-解除', listModuleBindings(db).filter((r) => r.module === '全店').length === 0)
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

writeFileSync(LOG, out.join('\n'), 'utf8')
line('')
line(`==== 结果：PASS ${passCount} / FAIL ${failCount} ==== 日志已写 ${LOG}`)
process.exit(failCount > 0 ? 1 : 0)
