// 任务 4L 回归测试（TDD，先写测试再接线）：①多源列表与 feed URL 拼接 ②latest.yml 预检（成功/404/无效/超时/顺序/全挂兜底）
// ③pending 待安装标记读写 ④启动安装判定。预检用真实本地 HTTP 服务，不 mock 被测对象、不跳过测试。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_OWNER, DEFAULT_PROXY_HOSTS, DEFAULT_REPO, GITHUB_RELEASES_BASE,
  buildUpdateSources, feedProbeUrl, githubFeedUrl, isValidLatestYml, probeFeed,
  proxyFeedUrl, selectFeed, type UpdateSource
} from '../src/main/system/update-sources'
import {
  clearPendingInstall, pendingInstallOf, readPendingInstall, shouldAutoInstall, writePendingInstall
} from '../src/main/system/update-pending'
import { readSettings } from '../src/main/system/settings-store'

const VALID_YML = 'version: 0.1.2\nfiles:\n  - url: EC-AI-Setup-0.1.2.exe\n    sha512: dGVzdA==\nsize: 123\n'
const HTML_BODY = '<!DOCTYPE html><html><body>not a feed</body></html>'

// ---------- 本地 HTTP 服务工具 ----------
interface FeedServer { url: string; close: () => Promise<void> }
const servers: FeedServer[] = []

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<FeedServer> {
  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      servers.push({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r()))
      })
      resolve(servers[servers.length - 1])
    })
  })
}

function serveYml(status: number, body: string) {
  return startServer((req, res) => {
    if (req.url?.endsWith('/latest.yml')) {
      res.writeHead(status, { 'content-type': 'text/plain' })
      res.end(body)
    } else {
      res.writeHead(404)
      res.end('nope')
    }
  })
}

function serveHang() {
  return startServer(() => { /* 永不响应，测超时 */ })
}

beforeAll(async () => {
  // 预创建一组固定服务供用例复用
})
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()))
})

describe('任务4L ① 多源列表与 feed URL 拼接', () => {
  it('默认源列表：官方 GitHub 在前，3 个实测可用的公共加速在后', () => {
    const sources = buildUpdateSources()
    expect(sources).toHaveLength(4)
    expect(sources[0].name).toBe('官方 GitHub')
    expect(sources[0].provider).toBe('github')
    expect(sources[0].official).toBe(true)
    expect(sources[1].name).toBe('gh-proxy.com 加速')
    expect(sources[1].provider).toBe('generic')
    expect(sources[1].official).toBe(false)
    expect(sources[2].name).toBe('ghproxy.net 加速')
    expect(sources[3].name).toBe('ghfast.top 加速')
    expect(DEFAULT_PROXY_HOSTS).toEqual(['gh-proxy.com', 'ghproxy.net', 'ghfast.top'])
  })

  it('官方 feed URL = https://github.com/{owner}/{repo}/releases/latest/download', () => {
    expect(githubFeedUrl(DEFAULT_OWNER, DEFAULT_REPO)).toBe(
      `${GITHUB_RELEASES_BASE}/${DEFAULT_OWNER}/${DEFAULT_REPO}/releases/latest/download`
    )
  })

  it('加速源 URL 拼接原理：https://{代理}/{官方完整 URL}', () => {
    expect(proxyFeedUrl('gh-proxy.com', 'MenphinaX', 'ElectronicCommerceAI')).toBe(
      'https://gh-proxy.com/https://github.com/MenphinaX/ElectronicCommerceAI/releases/latest/download'
    )
    expect(proxyFeedUrl('ghps.cc', 'o', 'r')).toBe(
      'https://ghps.cc/https://github.com/o/r/releases/latest/download'
    )
  })

  it('buildUpdateSources 支持自定义仓库与代理（扩展位）', () => {
    const s = buildUpdateSources('o', 'r', ['a.com', 'b.com', 'c.com'])
    expect(s.map((x) => x.name)).toEqual(['官方 GitHub', 'a.com 加速', 'b.com 加速', 'c.com 加速'])
    expect(s[1].feedUrl).toBe('https://a.com/https://github.com/o/r/releases/latest/download')
  })

  it('feedProbeUrl 在 feed 后拼接 latest.yml', () => {
    expect(feedProbeUrl('https://ghps.cc/https://github.com/o/r/releases/latest/download')).toBe(
      'https://ghps.cc/https://github.com/o/r/releases/latest/download/latest.yml'
    )
  })
})

describe('任务4L ② latest.yml 预检：成功/404/无效/超时/顺序/全挂兜底', () => {
  it('isValidLatestYml：有 version 行才算合法，HTML/空串不算', () => {
    expect(isValidLatestYml(VALID_YML)).toBe(true)
    expect(isValidLatestYml('version: 0.1.2\n')).toBe(true)
    expect(isValidLatestYml(HTML_BODY)).toBe(false)
    expect(isValidLatestYml('')).toBe(false)
    expect(isValidLatestYml('files:\n  - url: x.exe')).toBe(false)
  })

  it('probeFeed：200+合法 yml → true', async () => {
    const s = await serveYml(200, VALID_YML)
    expect(await probeFeed(s.url, 3000)).toBe(true)
  })

  it('probeFeed：404 → false；200+非法内容 → false', async () => {
    const s404 = await serveYml(404, 'not found')
    expect(await probeFeed(s404.url, 3000)).toBe(false)
    const sBad = await serveYml(200, HTML_BODY)
    expect(await probeFeed(sBad.url, 3000)).toBe(false)
  })

  it('probeFeed：超时（服务不响应）→ false，且耗时受 timeout 约束', async () => {
    const s = await serveHang()
    const t0 = Date.now()
    expect(await probeFeed(s.url, 300)).toBe(false)
    const elapsed = Date.now() - t0
    expect(elapsed).toBeGreaterThanOrEqual(280)
    expect(elapsed).toBeLessThan(3000)
  })

  it('selectFeed：按序预检，第一个成功的命中（两个都可用取前者）', async () => {
    const a = await serveYml(200, VALID_YML)
    const b = await serveYml(200, VALID_YML)
    const sources: UpdateSource[] = [
      { name: 'A', provider: 'generic', feedUrl: a.url, official: false },
      { name: 'B', provider: 'generic', feedUrl: b.url, official: false }
    ]
    const hit = await selectFeed(sources, 3000)
    expect(hit?.name).toBe('A')
  })

  it('selectFeed：前源失败自动切下一个（404 → 成功）', async () => {
    const a = await serveYml(404, 'gone')
    const b = await serveYml(200, VALID_YML)
    const sources: UpdateSource[] = [
      { name: 'A', provider: 'generic', feedUrl: a.url, official: false },
      { name: 'B', provider: 'generic', feedUrl: b.url, official: false }
    ]
    const hit = await selectFeed(sources, 3000)
    expect(hit?.name).toBe('B')
  })

  it('selectFeed：前源超时自动切下一个（挂起 → 成功）', async () => {
    const a = await serveHang()
    const b = await serveYml(200, VALID_YML)
    const sources: UpdateSource[] = [
      { name: 'A', provider: 'generic', feedUrl: a.url, official: false },
      { name: 'B', provider: 'generic', feedUrl: b.url, official: false }
    ]
    const hit = await selectFeed(sources, 300)
    expect(hit?.name).toBe('B')
  })

  it('selectFeed：全部失败 → null（兜底走「检查失败」）', async () => {
    const a = await serveYml(500, 'boom')
    const b = await serveHang()
    const sources: UpdateSource[] = [
      { name: 'A', provider: 'generic', feedUrl: a.url, official: false },
      { name: 'B', provider: 'generic', feedUrl: b.url, official: false }
    ]
    const t0 = Date.now()
    const hit = await selectFeed(sources, 200)
    expect(hit).toBeNull()
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

describe('任务4L ③ pending 待安装标记读写（settings.json updaterPendingInstall）', () => {
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ecai-4l-pending-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writePendingInstall → readPendingInstall 往返', () => {
    expect(readPendingInstall(dir)).toBeNull()
    writePendingInstall(dir, '0.1.2')
    expect(readPendingInstall(dir)).toBe('0.1.2')
    const settings = readSettings(dir)
    expect(pendingInstallOf(settings)).toBe('0.1.2')
  })

  it('clearPendingInstall 清空标记', () => {
    writePendingInstall(dir, '0.1.2')
    clearPendingInstall(dir)
    expect(readPendingInstall(dir)).toBeNull()
  })

  it('clearPendingInstall 无标记时幂等', () => {
    clearPendingInstall(dir)
    expect(readPendingInstall(dir)).toBeNull()
  })
})

describe('任务4L ④ 启动安装判定', () => {
  it('无标记 → 不自动安装', () => {
    expect(shouldAutoInstall(null, '0.1.1')).toBe(false)
  })

  it('标记版本高于当前 → 强制安装', () => {
    expect(shouldAutoInstall('0.1.2', '0.1.1')).toBe(true)
  })

  it('标记版本等于当前（已装到该版本）→ 不清不装', () => {
    expect(shouldAutoInstall('0.1.1', '0.1.1')).toBe(false)
  })
})
