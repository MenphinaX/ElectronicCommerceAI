// 任务 5 技能解析核心（纯函数，可脱离 Electron 单测）
// 解析 GitHub 链接 / 本地目录 / SKILL.md frontmatter；断网/坏链接必须真实报错，禁止假列表
import matter from 'gray-matter'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

export interface ParsedSkill {
  name: string
  description: string
  body: string
}

export interface SkillCandidate {
  source: 'github' | 'local'
  relPath: string
  name: string
  description: string
  rawUrl?: string
  content: string
  frontmatterOk: boolean
}

export interface GitHubRef {
  kind: 'github'
  owner: string
  repo: string
  ref?: string | null
  subPath?: string | null
}

export interface LocalRef {
  kind: 'local'
  dir: string
}

export type SourceInput = GitHubRef | LocalRef

// ---------- SKILL.md frontmatter 解析（gray-matter，MIT 成熟库：name/description + 正文） ----------
export function parseSkillMarkdown(text: string): ParsedSkill | null {
  try {
    const { data, content } = matter(text.replace(/^\uFEFF/, ''))
    const name = String(data.name ?? '').trim()
    if (!name) return null
    const description = String(data.description ?? '').trim()
    const body = content.replace(/^\n+/, '')
    return { name, description, body }
  } catch {
    return null
  }
}

// ---------- 输入解析：GitHub 链接或本地目录 ----------
export function parseSourceInput(input: string): SourceInput {
  const raw = input.trim()
  if (!raw) throw new Error('请输入 GitHub 链接或本地目录路径')
  // 本地路径：已存在 或 明显是文件系统路径
  if (existsSync(raw)) {
    const st = statSync(raw)
    if (!st.isDirectory()) throw new Error('本地路径必须是目录（仓库目录或含 skills 的目录）')
    return { kind: 'local', dir: resolve(raw) }
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('./') || raw.startsWith('.\\')) {
    throw new Error(`本地目录不存在：${raw}`)
  }
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/|$)(.*)$/i)
  const ssh = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/|$)(.*)$/)
  const hit = m ?? ssh
  if (!hit) {
    throw new Error(`无法识别的输入（需 GitHub 链接或本地目录）：${raw.slice(0, 120)}`)
  }
  const owner = hit[1]
  const repo = hit[2]
  let ref: string | null = null
  let subPath: string | null = null
  const rest = (hit[3] ?? '').trim()
  if (rest) {
    const segs = rest.split('/').filter(Boolean)
    const kind = segs.shift()
    if (kind === 'tree' || kind === 'blob') {
      // GitHub URL 约定：/tree/{ref}/{path}、/blob/{ref}/{file}，ref 恒为第一段（含斜杠分支以 %2F 编码）
      if (segs.length === 0) throw new Error(`GitHub 链接缺少分支名：${raw.slice(0, 120)}`)
      ref = segs.shift()!
      subPath = segs.length > 0 ? segs.join('/') : null
    } else {
      // 形如 /tree/main/... 之外的非标准尾巴，全部当 ref 处理不了就报错
      throw new Error(`GitHub 链接路径无法解析：${raw.slice(0, 120)}`)
    }
  }
  return { kind: 'github', owner, repo, ref: ref || null, subPath }
}

// ---------- 本地目录递归找 SKILL.md ----------
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.next', 'target', '__pycache__', 'venv', '.venv', '.idea', '.vscode'])

export interface LocalSkillFile {
  relPath: string
  content: string
}

export function scanLocalDir(dir: string, opts: { maxDepth?: number; maxFiles?: number } = {}): LocalSkillFile[] {
  const maxDepth = opts.maxDepth ?? 6
  const maxFiles = opts.maxFiles ?? 200
  const out: LocalSkillFile[] = []
  const root = resolve(dir)
  const walk = (cur: string, depth: number): void => {
    if (out.length >= maxFiles || depth > maxDepth) return
    let entries: Array<{ name: string; isDir: boolean }>
    try {
      entries = readdirSync(cur, { withFileTypes: true }).map((e) => ({ name: e.name, isDir: e.isDirectory() }))
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return
      const full = join(cur, e.name)
      if (e.isDir) {
        if (SKIP_DIRS.has(e.name)) continue
        walk(full, depth + 1)
      } else if (e.name.toLowerCase() === 'skill.md') {
        try {
          out.push({ relPath: relative(root, full).split(sep).join('/'), content: readFileSync(full, 'utf8') })
        } catch {
          // 单个文件读取失败跳过
        }
      }
    }
  }
  walk(root, 0)
  return out
}

// ---------- GitHub API 读取（真实解析，未认证有速率限制） ----------
export interface GithubRepoInfo {
  defaultBranch: string
}

export async function githubRepoInfo(owner: string, repo: string, signal?: AbortSignal): Promise<GithubRepoInfo> {
  if (signal?.aborted) throw new Error('已取消技能解析')
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EC-AI-Workbench' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
  })
  if (!res.ok) throw apiError('仓库信息', res)
  const data = (await res.json()) as { default_branch?: string }
  if (!data.default_branch) throw new Error('GitHub 返回异常：缺少 default_branch 字段')
  return { defaultBranch: data.default_branch }
}

export async function githubTreeSkillPaths(owner: string, repo: string, ref: string, subPath?: string | null, signal?: AbortSignal): Promise<Array<{ path: string }>> {
  if (signal?.aborted) throw new Error('已取消技能解析')
  const q = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeRef(ref)}?recursive=1`
  const res = await fetch(q, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EC-AI-Workbench' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
  })
  if (!res.ok) throw apiError('目录树', res)
  const data = (await res.json()) as { tree?: Array<{ path?: string; type?: string }> }
  if (!Array.isArray(data.tree)) throw new Error('GitHub 返回异常：tree 字段缺失')
  const prefix = subPath ? subPath.replace(/^\/+|\/+$/g, '') + '/' : ''
  return data.tree
    .filter((t) => t.type === 'blob' && t.path && basename(t.path).toLowerCase() === 'skill.md' && (prefix === '' || (t.path ?? '').startsWith(prefix)))
    .map((t) => ({ path: t.path! }))
}

export function rawGithubUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeRef(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export interface GithubContentFallback {
  owner: string
  repo: string
  ref: string
  path: string
}

export async function fetchGithubText(url: string, apiFallback?: GithubContentFallback, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new Error('已取消技能解析')
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EC-AI-Workbench' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
    if (res.ok === false) throw apiError('文件', res)
    return res.text()
  } catch (e) {
    if (signal?.aborted) throw new Error('已取消技能解析')
    if (apiFallback === undefined || apiFallback === null) throw e
    // raw.githubusercontent.com 不可达（国内常见）时改走 GitHub API contents：仍读真实内容，禁止假列表
    const q = 'https://api.github.com/repos/' + apiFallback.owner + '/' + apiFallback.repo + '/contents/' + apiFallback.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeRef(apiFallback.ref)
    const res2 = await fetch(q, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EC-AI-Workbench' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    })
    if (res2.ok === false) throw apiError('文件(API)', res2)
    const data = (await res2.json()) as { encoding?: string; content?: string }
    if ((data.encoding === 'base64') === false || data.content === undefined || data.content === null || data.content === '') throw new Error('GitHub API 返回异常：contents 缺少 base64 内容')
    return Buffer.from(data.content, 'base64').toString('utf8')
  }
}

function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/')
}

function apiError(what: string, res: { status: number; headers: Headers; text(): Promise<string> }): Error {
  if (res.status === 404) return new Error(`GitHub ${what}不存在（404）：仓库、分支或路径可能写错`)
  if (res.status === 403) {
    const reset = res.headers.get('x-ratelimit-reset')
    const msg = reset ? `，${new Date(Number(reset) * 1000).toLocaleString('zh-CN')} 后可重试` : ''
    return new Error(`GitHub API 限流（403）${msg}：请稍后再试，或换用本地仓库目录`)
  }
  return new Error(`GitHub ${what}请求失败（HTTP ${res.status}）`)
}

// ---------- git clone --depth 1 兜底（git 可用时；异步 + 可取消 + 中文报错） ----------
const GIT_TIMEOUT_MS = 30_000
const GIT_RETRYABLE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH', 'EADDRNOTAVAIL', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'])

/** git 失败分类 → 可读中文报错（网络/超时/仓库不存在/取消/未知） */
export function classifyGitError(err: unknown): string {
  const e = err as { code?: string | number; name?: string; signal?: string; killed?: boolean; gitStderr?: string; message?: string }
  const msg = String(e.message ?? '')
  if (e.name === 'AbortError' || /abort|cancel/i.test(msg)) return '已取消技能解析'
  if (e.code === 'ETIMEDOUT' || (e.killed === true && e.signal === 'SIGTERM') || /ETIMEDOUT|timed out/i.test(msg)) {
    return '网络超时：git 拉取超过 30 秒未完成，请检查网络后重试'
  }
  if (typeof e.code === 'string' && GIT_RETRYABLE.has(e.code)) return '网络不可达：无法连接 GitHub，请检查网络后重试'
  const stderr = String(e.gitStderr ?? '')
  if (e.code === 128 || /not found|could not read Username|Authentication failed|does not exist/i.test(stderr)) {
    return '仓库不存在或无权访问：请检查仓库地址（可能已改名、删除或设为私有）'
  }
  return `git 拉取失败：${(msg || stderr || '未知错误').slice(0, 200)}`
}

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function execGitClone(args: string[], opts: { timeoutMs: number; signal?: AbortSignal }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile('git', args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: opts.timeoutMs, signal: opts.signal }, (err, _stdout, stderr) => {
      if (err) reject(Object.assign(err, { gitStderr: String(stderr ?? '') }))
      else resolve()
    })
  })
}

export async function cloneSkillsViaGit(owner: string, repo: string, ref?: string | null, subPath?: string | null, opts: { signal?: AbortSignal } = {}): Promise<LocalSkillFile[]> {
  if (opts.signal?.aborted) throw new Error('已取消技能解析')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-skill-'))
  try {
    const args = ['clone', '--depth', '1', '--filter=blob:none']
    if (ref) args.push('--branch', ref)
    args.push(`https://github.com/${owner}/${repo}.git`, dir)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await execGitClone(args, { timeoutMs: GIT_TIMEOUT_MS, signal: opts.signal })
        break
      } catch (e) {
        if (opts.signal?.aborted) throw new Error('已取消技能解析')
        const cls = classifyGitError(e)
        // 只对快速失败的网络错误重试 1 次；超时不重试（30 秒内必须给出明确中文报错）
        const retryable = cls.includes('网络不可达')
        if (!retryable || attempt >= 2) throw new Error(cls)
        await sleepMs(800)
      }
    }
    const all = scanLocalDir(dir, { maxDepth: 8 })
    const prefix = subPath ? subPath.replace(/^\/+|\/+$/g, '') + '/' : ''
    const filtered = prefix ? all.filter((f) => f.relPath.startsWith(prefix)) : all
    if (filtered.length === 0) throw new Error(`git clone 成功但路径 ${subPath ?? '/'} 下没有找到 SKILL.md`)
    return filtered
  } catch (e) {
    if (opts.signal?.aborted) throw new Error('已取消技能解析')
    const err = e as Error
    const m = err.message
    if (/^(已取消|网络|仓库不存在|git 拉取失败|git clone 成功)/.test(m)) throw err
    throw new Error(`git clone 失败：${m.slice(0, 300)}`)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 临时目录清理失败不影响主流程
    }
  }
}

// ---------- 入口：输入 → 候选技能列表（真实读取 SKILL.md 内容） ----------
export async function listSkillCandidates(input: string, opts: { gitFallback?: boolean; signal?: AbortSignal } = {}): Promise<SkillCandidate[]> {
  const src = parseSourceInput(input)
  if (src.kind === 'local') {
    const files = scanLocalDir(src.dir)
    if (files.length === 0) throw new Error(`目录 ${src.dir} 下没有找到 SKILL.md 文件`)
    return files.map((f) => toCandidate('local', f.relPath, f.content))
  }
  // github 源
  const info = await githubRepoInfo(src.owner, src.repo, opts.signal)
  const ref = src.ref ?? info.defaultBranch
  try {
    const paths = await githubTreeSkillPaths(src.owner, src.repo, ref, src.subPath, opts.signal)
    if (paths.length === 0) {
      throw new Error(`仓库 ${src.owner}/${src.repo}（分支 ${ref}）${src.subPath ? '路径 ' + src.subPath + ' 下' : ''}没有找到 SKILL.md`)
    }
    // 并行读取各 SKILL.md（raw 不可达时逐个走 API 兜底），避免 18 个文件串行拖慢解析
    const out: SkillCandidate[] = await Promise.all(
      paths.map(async (p) => {
        const url = rawGithubUrl(src.owner, src.repo, ref, p.path)
        const text = await fetchGithubText(url, { owner: src.owner, repo: src.repo, ref, path: p.path }, opts.signal)
        return toCandidate('github', p.path, text, url)
      })
    )
    return out
  } catch (e) {
    if (opts.signal?.aborted) throw new Error('已取消技能解析')
    if (!opts.gitFallback) throw e
    const files = await cloneSkillsViaGit(src.owner, src.repo, ref, src.subPath, { signal: opts.signal })
    return files.map((f) => toCandidate('github', f.relPath, f.content))
  }
}

function toCandidate(source: 'github' | 'local', relPath: string, content: string, rawUrl?: string): SkillCandidate {
  const parsed = parseSkillMarkdown(content)
  const fallbackName = basename(dirname(relPath)) || relPath
  return {
    source,
    relPath,
    name: parsed?.name || fallbackName,
    description: parsed?.description || '',
    rawUrl,
    content,
    frontmatterOk: !!parsed?.name
  }
}
