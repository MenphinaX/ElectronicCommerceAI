// 任务 9 验收辅助：用授权工具 exe（portable）无头签发各状态授权文件 + 制造篡改文件
const { spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const root = process.cwd()
const exe = join(root, 'out/license-tool/EC-AI-授权工具.exe')
const outDir = join(root, 'out/task9')
mkdirSync(outDir, { recursive: true })

const machine = process.argv[2]
if (!machine || !machine.startsWith('ECAI-')) {
  console.error('usage: node scripts/task9-gen-licenses.cjs <machineCode>')
  process.exit(1)
}

function runHeadless(opts) {
  const resultFile = join(outDir, '.headless-result.txt')
  const env = { ...process.env, EC_AI_TOOL_HEADLESS: JSON.stringify(opts), EC_AI_TOOL_RESULT_FILE: resultFile }
  const r = spawnSync(exe, [], { env, encoding: 'utf8', windowsHide: true, timeout: 120000 })
  let raw = ''
  try {
    raw = readFileSync(resultFile, 'utf8')
  } catch {
    raw = ''
  }
  const m = /TOOL_HEADLESS_RESULT (.*)/.exec(raw)
  if (!m) throw new Error('工具无结果文件输出: ' + ((r.stdout || '') + (r.stderr || '')).slice(0, 200))
  const res = JSON.parse(m[1])
  if (!res.ok) throw new Error('签发失败: ' + JSON.stringify(res))
  return res
}

const base = join(outDir, '').replace(/\\/g, '/') + '/'
const cases = [
  { name: 'valid', opts: { machine, expires: '2026-12-31', issuer: '管理员', purpose: '', out: base + 'valid.lic' } },
  { name: 'expiring', opts: { machine, expires: '2026-08-24', issuer: '管理员', purpose: '', out: base + 'expiring.lic' } },
  { name: 'expired', opts: { machine, expires: '2026-08-13', issuer: '管理员', purpose: '', out: base + 'expired.lic' } },
  { name: 'unlock', opts: { expires: '2026-09-30', issuer: '管理员', purpose: '上门重置密码锁', out: base + 'unlock.lic' } }
]

for (const c of cases) {
  const res = runHeadless(c.opts)
  console.log('GEN ' + c.name + ' ok type=' + res.type + ' expires=' + res.expires + ' path=' + res.path)
}

// 篡改：复制 valid.lic，翻转中段一个字节
const valid = Buffer.from(readFileSync(join(outDir, 'valid.lic'), 'utf8'), 'utf8')
const mid = Math.floor(valid.length / 2)
valid[mid] = valid[mid] === 65 ? 66 : 65
writeFileSync(join(outDir, 'tampered.lic'), valid)
console.log('GEN tampered ok (byte ' + mid + ' flipped)')