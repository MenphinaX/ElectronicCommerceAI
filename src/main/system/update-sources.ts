// 任务 4L：更新源构建与预检（纯函数，不依赖 electron，供单测与 updater.ts 使用）
// 源顺序：0=官方 GitHub（默认 provider，读 app-update.yml）→ 1..n=公共加速代理（2026-08-15 实测 ghproxy.com/ghps.cc 已失效，换 gh-proxy.com/ghproxy.net/ghfast.top）
// 加速原理：https://{代理}/{官方完整 URL}，electron-updater generic feed 会拼 /latest.yml 并基于同源下载安装包
export const DEFAULT_OWNER = 'MenphinaX'
export const DEFAULT_REPO = 'ElectronicCommerceAI'
export const GITHUB_RELEASES_BASE = 'https://github.com'
export const DEFAULT_PROXY_HOSTS: readonly string[] = ['gh-proxy.com', 'ghproxy.net', 'ghfast.top']
export const PROBE_TIMEOUT_MS = 8000

export interface UpdateSource {
  name: string
  provider: 'github' | 'generic'
  /** feed 基地址（不含 latest.yml） */
  feedUrl: string
  /** 官方源（保持默认 github provider，不 setFeedURL） */
  official: boolean
}

export function githubFeedUrl(owner: string, repo: string): string {
  return `${GITHUB_RELEASES_BASE}/${owner}/${repo}/releases/latest/download`
}

export function proxyFeedUrl(proxyHost: string, owner: string, repo: string): string {
  return `https://${proxyHost}/${githubFeedUrl(owner, repo)}`
}

export function buildUpdateSources(
  owner: string = DEFAULT_OWNER,
  repo: string = DEFAULT_REPO,
  proxyHosts: readonly string[] = DEFAULT_PROXY_HOSTS
): UpdateSource[] {
  return [
    { name: '官方 GitHub', provider: 'github', feedUrl: githubFeedUrl(owner, repo), official: true },
    ...proxyHosts.map((host) => ({
      name: `${host} 加速`,
      provider: 'generic' as const,
      feedUrl: proxyFeedUrl(host, owner, repo),
      official: false
    }))
  ]
}

export function feedProbeUrl(feedUrl: string): string {
  return `${feedUrl}/latest.yml`
}

/** latest.yml 合法判定：至少存在 version 行（防 200 但返回 HTML 的假成功） */
export function isValidLatestYml(text: string): boolean {
  return /^\s*version\s*:\s*\S+/m.test(text)
}

/** 预检单个源：GET {feed}/latest.yml，超时 timeoutMs；2xx 且内容含 version 才算成功 */
export async function probeFeed(feedUrl: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(feedProbeUrl(feedUrl), { signal: controller.signal })
    if (!res.ok) return false
    const text = await res.text()
    return isValidLatestYml(text)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 按序预检，返回第一个成功的源；全部失败返回 null */
export async function selectFeed(sources: UpdateSource[], timeoutMs: number): Promise<UpdateSource | null> {
  for (const source of sources) {
    if (await probeFeed(source.feedUrl, timeoutMs)) return source
  }
  return null
}
