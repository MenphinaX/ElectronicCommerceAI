// 任务 4M：发布 v0.1.4（latest.yml + exe + blockmap 三件套），验证 assets=3
// git 直连不通 → Releases API + uploads API；token 来自 git credential fill
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN = process.env.GH_TOKEN
const REPO = 'MenphinaX/ElectronicCommerceAI'
const RELEASE_DIR = 'C:/Users/Administrator/Desktop/EC-AI-主程序源码/release'
const TAG = 'v0.1.4'
const VERSION = '0.1.4'
const BODY = [
  '## EC AI v0.1.4（任务 4M · 开屏卡死修复）',
  '',
  '**修复**',
  '- 开屏点击/自动进入后无法卸载、进不去工作台的 0.1.3 回归：App.vue 新增 `splashEntered` 显式关闭状态，进入后真实卸载开屏并渲染工作台（`.splash` 消失、`.app-body` 出现，打包态 CDP 真机验收 11/11）。',
  '- 保持「每次启动显示开屏」语义：不再依赖 `lastSplashDate` 日期判断；`lastSplashDate=今天` 仍显示开屏，`splashEnabled=false` 直接进工作台。',
  '- 同步修正测试/验收脚本断言与真实行为不一致（同日 lastSplashDate 应为 true、开屏进入后 DOM 卸载断言）、CONTEXT.md 开屏术语、package-lock.json 根版本残留 0.0.1。',
  '',
  '**0.1.2 事故后续**',
  '- 0.1.2/0.1.3 已发布且损坏（0.1.2 junction node_modules 依赖缺失启动即崩；0.1.3 开屏卡死、Release 缺安装包），不复用版本号。',
  '- 0.1.4 从桌面源码包重新构建：node_modules 真复制（robocopy /E，禁 junction），asar 6431 条目，section-matter/js-yaml/kind-of/strip-bom-string 全部入包；安装包 130.4MB（0.1.2 异常 125.5MB）。',
  '',
  '**三件套已上传**',
  '- `latest.yml` / `EC-AI-Setup-0.1.4.exe` / `EC-AI-Setup-0.1.4.exe.blockmap`',
  '',
  '数据目录不动，只替换程序文件。装了损坏 0.1.2 的机器需手动装 0.1.4；0.1.1 端可自动更新。'
].join('\n')

const H = { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'ecai-publish', Accept: 'application/vnd.github+json' }

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!r.ok) throw new Error('API ' + r.status + ' ' + url + ' :: ' + String(body).slice(0, 300))
  return body
}

// 1) 建 Release（tag 不存在则由 GitHub 自动建）
const release = await api('https://api.github.com/repos/' + REPO + '/releases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ tag_name: TAG, name: 'EC AI v' + VERSION, body: BODY, draft: false, prerelease: false })
})
console.log('RELEASE created id=' + release.id + ' tag=' + release.tag_name)

// 2) 上传三件套
const assets = [
  ['latest.yml', 'text/plain'],
  ['EC-AI-Setup-' + VERSION + '.exe', 'application/octet-stream'],
  ['EC-AI-Setup-' + VERSION + '.exe.blockmap', 'application/octet-stream']
]
for (const [name, ct] of assets) {
  const file = join(RELEASE_DIR, name)
  const buf = readFileSync(file)
  const uploadUrl = 'https://uploads.github.com/repos/' + REPO + '/releases/' + release.id + '/assets?name=' + encodeURIComponent(name)
  const r = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...H, 'Content-Type': ct, 'Content-Length': String(buf.length) },
    body: new Uint8Array(buf)
  })
  const txt = await r.text()
  let up = null
  try { up = txt ? JSON.parse(txt) : null } catch { up = txt }
  if (!r.ok) throw new Error('UPLOAD ' + r.status + ' ' + name + ' :: ' + String(up).slice(0, 300))
  console.log('UPLOAD ok ' + name + ' (' + up.size + ' bytes) id=' + up.id)
}

// 3) 验证 assets=3
const check = await api('https://api.github.com/repos/' + REPO + '/releases/tags/' + TAG)
console.log('ASSETS count=' + check.assets.length + ' names=' + check.assets.map((a) => a.name).sort().join(', '))
if (check.assets.length !== 3) { console.error('ASSETS-VERIFY-FAIL'); process.exit(1) }
console.log('PUBLISH-014-OK')