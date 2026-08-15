// 任务 4M：GitHub 源码同步（Git Data API；git 直连不通）。对比 blob sha，只更新差异文件并提交。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const TOKEN = process.env.GH_TOKEN
const REPO = 'MenphinaX/ElectronicCommerceAI'
const LOCAL = 'C:/Users/Administrator/Desktop/EC-AI-主程序源码'
const BRANCH = 'main'
const H = { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'ecai-sync', Accept: 'application/vnd.github+json' }

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!r.ok) throw new Error('API ' + r.status + ' ' + url + ' :: ' + String(body).slice(0, 300))
  return body
}
function blobSha(buf) {
  return createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex')
}
async function createBlob(buf) {
  const b = await api('https://api.github.com/repos/' + REPO + '/git/blobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' })
  })
  return b.sha
}

// 待同步文件（桌面源码包内路径）
const files = [
  'package.json', 'package-lock.json',
  'src/renderer/src/App.vue',
  'src/renderer/src/autoshot.ts',
  'src/renderer/src/utils/splash.ts',
  'src/renderer/src/components/splash/SplashGreeting.vue',
  'src/renderer/src/components/onboarding/OnboardingWizard.vue',
  'src/renderer/src/views/SettingsView.vue',
  'src/renderer/src/stores/settings.ts',
  'scripts/task4f-acceptance.mjs',
  'scripts/task4i-acceptance.mjs',
  'tests/task4f.test.ts'
]

// 当前分支 HEAD 与整树
const head = await api('https://api.github.com/repos/' + REPO + '/git/ref/heads/' + BRANCH)
const headSha = head.object.sha
const treeRes = await api('https://api.github.com/repos/' + REPO + '/git/trees/' + headSha + '?recursive=1')
const existing = new Map(treeRes.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]))

// 逐个文件：sha 变化才更新/新增
const updates = []
for (const rel of files) {
  const buf = readFileSync(join(LOCAL, rel))
  const localSha = blobSha(buf)
  if (existing.get(rel) === localSha) {
    console.log('SAME ' + rel)
    continue
  }
  const blob = await createBlob(buf)
  updates.push({ path: rel, mode: '100644', type: 'blob', sha: blob })
  console.log('UPD  ' + rel + ' blob=' + blob.slice(0, 8))
}
if (updates.length === 0) { console.log('NO-CHANGES'); process.exit(0) }

// 新树 = 旧树（去掉被更新路径）+ 更新
const treeItems = treeRes.tree.filter((x) => x.type === 'blob' && !updates.some((u) => u.path === x.path))
  .map((x) => ({ path: x.path, mode: x.mode, type: 'blob', sha: x.sha }))
  .concat(updates)
const newTree = await api('https://api.github.com/repos/' + REPO + '/git/trees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base_tree: headSha, tree: treeItems })
})
const commit = await api('https://api.github.com/repos/' + REPO + '/git/commits', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'chore: 任务 4M 开屏卡死修复 + 0.1.4 版本同步（App.vue splashEntered、验收断言、测试）',
    tree: newTree.sha,
    parents: [headSha],
    author: { name: 'MenphinaX', email: 'menphinax@users.noreply.github.com', date: new Date().toISOString() },
    committer: { name: 'MenphinaX', email: 'menphinax@users.noreply.github.com', date: new Date().toISOString() }
  })
})
await api('https://api.github.com/repos/' + REPO + '/git/refs/heads/' + BRANCH, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sha: commit.sha, force: false })
})
console.log('COMMIT ' + commit.sha.slice(0, 12) + ' files=' + updates.length)