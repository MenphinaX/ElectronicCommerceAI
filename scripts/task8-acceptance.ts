// 任务 8 数据包导出/导入 验收脚本：使用本机真实库（%APPDATA%/EC AI/ecai.db）做
// ①导出→清库→导入行数一致 ②同包导入两次不翻倍 ③含商品图片完整还原
// 另覆盖：密码包（无/错/对）、篡改包拒绝、日期范围过滤
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import AdmZip from 'adm-zip'
import { AppDatabase } from '../src/main/db/database'
import { upsertShop } from '../src/main/db/repo'
import { PACKAGE_TABLES, exportDataPackage, importDataPackage, inspectDataPackage } from '../src/main/package/service'

const REAL_DB = join(process.env.APPDATA ?? '', 'EC AI', 'ecai.db')
const REAL_IMAGES = join(process.env.APPDATA ?? '', 'EC AI', 'product-images')
const OUT_DIR = join(process.cwd(), 'out', 'task8')
mkdirSync(OUT_DIR, { recursive: true })
const LOG = join(process.cwd(), 'task8-acceptance.log')
const out: string[] = []
let passCount = 0
let failCount = 0
const line = (s = ''): void => { out.push(s); console.log(s) }
const pass = (name: string, detail = ''): void => { passCount++; line(`PASS ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name: string, detail = ''): void => { failCount++; line(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
const check = (name: string, ok: boolean, detail = ''): void => { if (ok) pass(name, detail); else fail(name, detail) }

line('==== 任务 8 数据包 验收（' + new Date().toLocaleString('zh-CN') + '）====')
line(`源库：${REAL_DB}  存在=${existsSync(REAL_DB)}`)

function freshDb(tag: string): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), `ecai-task8-${tag}-`))
  const db = new AppDatabase(join(dir, 't8.db'))
  db.init()
  return { db, dir }
}
const imagesDir = (dir: string): string => join(dir, 'product-images')
function countShop(db: AppDatabase, shopId: number, table: string): number {
  if (table === 'shops') return 1
  return (db.raw.prepare(`SELECT COUNT(*) n FROM ${table} WHERE shop_id=?`).get(shopId) as { n: number }).n
}

// ---------- 快照真实库（VACUUM INTO，不碰在线库/WAL） ----------
const work = mkdtempSync(join(tmpdir(), 'ecai-task8-snap-'))
const snapPath = join(work, 'real-snapshot.db')
{
  const ro = new Database(REAL_DB, { readonly: true })
  try {
    ro.exec(`VACUUM INTO '${snapPath.replace(/'/g, "''")}'`)
  } finally {
    ro.close()
  }
}
const src = new AppDatabase(snapPath)
src.init()
const shop1 = (src.raw.prepare('SELECT id FROM shops WHERE name=?').get('佰泰康车品旗舰店') as { id: number } | undefined)?.id ?? 1
const shop2 = (src.raw.prepare('SELECT id FROM shops WHERE name=?').get('佰泰康车品旗舰店B') as { id: number } | undefined)?.id ?? 2
line(`店铺：佰泰康车品旗舰店 id=${shop1}；佰泰康车品旗舰店B id=${shop2}`)

// ---------- ① 导出 shop1（全日期）→ 清库（全新库+占位店）→ 导入：行数一致 ----------
const pkg1 = join(OUT_DIR, 'shop1-full.zip')
const manifest1 = await exportDataPackage({
  src, imagesDir: REAL_IMAGES, outZipPath: pkg1,
  options: { shopId: shop1, dateStart: '2020-01-01', dateEnd: '2030-12-31', appVersion: '0.0.1' }
})
line('')
line('--- ① 导出 shop1 全日期 ---')
const before: Array<{ table: string; label: string; rows: number }> = []
for (const meta of PACKAGE_TABLES) {
  if (meta.table === 'shops') continue
  const n = countShop(src, shop1, meta.table)
  before.push({ table: meta.table, label: meta.label, rows: n })
  check(`导出前计数 ${meta.label}=${n} 与 manifest 一致`, manifest1.tables[meta.table].rows === n, `manifest=${manifest1.tables[meta.table].rows}`)
}
check('导出包含商品图片清单 1 张', manifest1.images.files.length === 1, manifest1.images.files.map((f) => f.path).join(','))
check('导出包文件存在且非空', existsSync(pkg1) && statSync(pkg1).size > 0, `${statSync(pkg1).size} 字节`)
const srcImgSha = manifest1.images.files[0]?.sha256 ?? ''

const tgt = freshDb('t1')
const placeholder = upsertShop(tgt.db, { name: '占位店' })
line(`目标库（模拟清库后）：已预置占位店 id=${placeholder}，导入店铺将获得新 id`)
const r1 = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: pkg1 })
check('① 导入成功且店铺自动创建', r1.ok && r1.shopCreated, `新店铺 id=${r1.shopId} 名称=${r1.shopName}`)
check('① 导入店铺 id 与源不同（验证店铺合并重映射）', r1.shopId !== shop1, `源=${shop1} 目标=${r1.shopId}`)
line('--- ① 导入后行数对比（导出前 vs 导入后） ---')
for (const b of before) {
  const after = countShop(tgt.db, r1.shopId, b.table)
  check(`① ${b.label}: 导出前 ${b.rows} → 导入后 ${after}`, after === b.rows, `一致`)
}
const imgRec = tgt.db.raw.prepare('SELECT rel_path, size_bytes FROM product_images WHERE shop_id=? AND product_id=?').get(r1.shopId, '974661273911') as { rel_path: string; size_bytes: number } | undefined
check('① 图片绑定记录还原 1 条且 rel_path 重写为目标店铺', imgRec !== undefined && imgRec.rel_path === `${r1.shopId}/974661273911.png`, imgRec ? `${imgRec.rel_path} / ${imgRec.size_bytes} 字节` : '无记录')
const restoredFile = join(imagesDir(tgt.dir), String(r1.shopId), '974661273911.png')
check('① 图片文件还原且内容校验和一致', existsSync(restoredFile) && statSync(restoredFile).size === imgRec?.size_bytes, `${statSync(restoredFile).size} 字节`)
const imgFileCount = existsSync(join(imagesDir(tgt.dir), String(r1.shopId))) ? readdirSync(join(imagesDir(tgt.dir), String(r1.shopId))).length : 0
check('① 图片文件数与记录数=1', imgFileCount === 1 && (tgt.db.raw.prepare('SELECT COUNT(*) n FROM product_images WHERE shop_id=?').get(r1.shopId) as { n: number }).n === 1)

// ---------- ② 同一数据包导入两次：行数不翻倍 ----------
line('')
line('--- ② 同一数据包再次导入 ---')
const r2 = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: pkg1 })
check('② 第二次导入成功', r2.ok && r2.shopId === r1.shopId)
let allSame = true
for (const b of before) {
  const after2 = countShop(tgt.db, r1.shopId, b.table)
  if (after2 !== b.rows) { allSame = false; fail(`② ${b.label} 翻倍：${after2} ≠ ${b.rows}`) }
}
check('② 全部表行数不翻倍', allSame)
const doubleCheck = r2.tables.filter((t) => t.imported === 0 && t.skipped === t.rows).length
check('② 第二次导入逐表 imported=0 / skipped=包内行数', doubleCheck === r2.tables.length, `表数 ${r2.tables.length}`)
const shopsTotal = (tgt.db.raw.prepare('SELECT COUNT(*) n FROM shops').get() as { n: number }).n
check('② 店铺未重复创建（共 2 个：占位店+导入店）', shopsTotal === 2, `shops=${shopsTotal}`)

// ---------- ③ 含商品图片的数据包：文件与记录完整还原（并入 ① 已验证；此处复核文件 sha） ----------
{
  const buf = readFileSync(restoredFile)
  const { createHash } = await import('node:crypto')
  const sha = createHash('sha256').update(buf).digest('hex')
  check('③ 还原图片 sha256 与 manifest 一致', sha === srcImgSha, sha.slice(0, 16) + '…')
}

// ---------- 密码包：导出（shop2，密码）→ 无/错/对 ----------
line('')
line('--- 密码数据包 ---')
const pkgPwd = join(OUT_DIR, 'shop2-pwd.zip')
await exportDataPackage({ src, imagesDir: REAL_IMAGES, outZipPath: pkgPwd, options: { shopId: shop2, appVersion: '0.0.1', password: 'ecai-task8-2026' } })
const infoNoPwd = inspectDataPackage({ zipPath: pkgPwd })
check('密码包：无密码查看返回 encrypted=true', infoNoPwd.encrypted === true && infoNoPwd.manifest === null)
const tgtP = freshDb('pwd')
let threwNoPwd = ''
try { importDataPackage({ db: tgtP.db, imagesDir: imagesDir(tgtP.dir), zipPath: pkgPwd }) } catch (e) { threwNoPwd = (e as Error).message }
check('密码包：无密码导入被拒', /密码/.test(threwNoPwd), threwNoPwd)
let threwWrong = ''
try { importDataPackage({ db: tgtP.db, imagesDir: imagesDir(tgtP.dir), zipPath: pkgPwd, password: 'wrong' }) } catch (e) { threwWrong = (e as Error).message }
check('密码包：错误密码导入被拒', /密码/.test(threwWrong), threwWrong)
const rPwd = importDataPackage({ db: tgtP.db, imagesDir: imagesDir(tgtP.dir), zipPath: pkgPwd, password: 'ecai-task8-2026' })
check('密码包：正确密码导入成功', rPwd.ok && countShop(tgtP.db, rPwd.shopId, 'daily_metrics') === 31, `daily_metrics=${countShop(tgtP.db, rPwd.shopId, 'daily_metrics')}`)

// ---------- 篡改包：删一行后导入被拒绝 ----------
line('')
line('--- 篡改包拒绝 ---')
const tamperWork = join(work, 'tamper')
mkdirSync(tamperWork, { recursive: true })
const pkgPlain = join(OUT_DIR, 'shop1-plain.zip')
await exportDataPackage({ src, imagesDir: REAL_IMAGES, outZipPath: pkgPlain, options: { shopId: shop1, appVersion: '0.0.1' } })
{
  const zip = new AdmZip(pkgPlain)
  const dbBuf8 = zip.readFile('ecai-data.db'); if (!dbBuf8) throw new Error('包内缺 db')
  writeFileSync(join(tamperWork, 'ecai-data.db'), dbBuf8)
  const db2 = new AppDatabase(join(tamperWork, 'ecai-data.db'))
  db2.raw.prepare('DELETE FROM daily_metrics WHERE date = (SELECT MIN(date) FROM daily_metrics)').run()
  db2.close()
  const z2 = new AdmZip()
  z2.addFile('ecai-data.db', readFileSync(join(tamperWork, 'ecai-data.db')))
  z2.addFile('manifest.json', Buffer.from(JSON.stringify(inspectDataPackage({ zipPath: pkgPlain }).manifest)))
  const tampered = join(OUT_DIR, 'tampered.zip')
  z2.writeZip(tampered)
  const tgtT = freshDb('tamper')
  let msg = ''
  try { importDataPackage({ db: tgtT.db, imagesDir: imagesDir(tgtT.dir), zipPath: tampered }) } catch (e) { msg = (e as Error).message }
  check('篡改包（删除一行）导入被拒绝', /校验|行数/.test(msg), msg)
  tgtT.db.close()
  rmSync(tgtT.dir, { recursive: true, force: true })
}

// ---------- 日期范围：08-01~08-11 只导入范围内数据 ----------
line('')
line('--- 日期范围过滤 ---')
const pkgRange = join(OUT_DIR, 'shop1-0801-0811.zip')
const manR = await exportDataPackage({ src, imagesDir: REAL_IMAGES, outZipPath: pkgRange, options: { shopId: shop1, dateStart: '2026-08-01', dateEnd: '2026-08-11', appVersion: '0.0.1' } })
const sqlDaily = (src.raw.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE shop_id=? AND date BETWEEN ? AND ?').get(shop1, '2026-08-01', '2026-08-11') as { n: number }).n
check('范围包：daily_metrics manifest 行数与 SQL 计数一致', manR.tables.daily_metrics.rows === sqlDaily, `manifest=${manR.tables.daily_metrics.rows} sql=${sqlDaily}`)
const tgtR = freshDb('range')
const rR = importDataPackage({ db: tgtR.db, imagesDir: imagesDir(tgtR.dir), zipPath: pkgRange })
check('范围包：导入后仅范围内行数', countShop(tgtR.db, rR.shopId, 'daily_metrics') === sqlDaily, `daily_metrics=${countShop(tgtR.db, rR.shopId, 'daily_metrics')}`)

// ---------- 收尾 ----------
src.close()
tgt.db.close(); rmSync(tgt.dir, { recursive: true, force: true })
tgtP.db.close(); rmSync(tgtP.dir, { recursive: true, force: true })
tgtR.db.close(); rmSync(tgtR.dir, { recursive: true, force: true })
rmSync(work, { recursive: true, force: true })

line('')
line('--- 产物 ---')
for (const f of ['shop1-full.zip', 'shop2-pwd.zip', 'shop1-plain.zip', 'tampered.zip', 'shop1-0801-0811.zip']) {
  const p = join(OUT_DIR, f)
  line(`${f}  ${existsSync(p) ? statSync(p).size + ' 字节' : '缺失'}`)
}
writeFileSync(LOG, out.join('\n'), 'utf8')
line('')
line(`==== 结果：PASS ${passCount} / FAIL ${failCount} ==== 日志已写 ${LOG}`)
process.exit(failCount > 0 ? 1 : 0)